var path = require('path')
var spawn = require('child_process').spawn
var async = require('neo-async')
var AWS = require('aws-sdk')
var BuildInfo = require('./buildInfo.js')
var utils = require('../utils')
var log = require('../utils/log')
var config = require('../utils/config')
var db = require('../db')
var github = require('../sources/github')
var slack = require('../notifications/slack')
var sns = require('../notifications/sns')

var ecs = new AWS.ECS()

module.exports = runBuild

function runBuild(buildData, context, cb) {
  // TODO: figure out whether to use mergeable flags on GH events or not

  var build = new BuildInfo(buildData, context)

  // Sometimes errors will occur that we don't catch, and Lambda will retry those requests,
  // so check if we've seen this request ID before, and if so, ignore it
  async.parallel({
    retry: (cb) => db.checkIfRetry(build, cb),
    configs: (cb) => db.getConfigs(['global', build.project], cb),
    checkVersion: config.checkVersion,
  }, function(err, data) {
    if (err) return cb(err)

    if (data.retry) {
      log.info(`Ignoring retry request for build #${data.retry.buildNum}`)
      return cb() // TODO: Ensure Github/Slack statuses are 'finished' too?
    }

    build.config = config.initConfig(data.configs, build)

    // If config says we can't build, and we can't override, then we're done
    if (!build.config.build && !build.config.allowConfigOverrides) {
      log.info('config.build set to false and cannot override – not running build')
      return cb()
    }

    config.initSync(build.config)

    cloneAndBuild(build, cb)
  })
}

function cloneAndBuild(build, cb) {

  clone(build, function(err) {
    if (err) return cb(err)

    // Now that we've cloned the repository we can check for config files
    build.config = config.prepareBuildConfig(build)

    if (!build.config.build) {
      log.info('config.build set to false – not running build')
      return cb()
    }

    db.initBuild(build, function(err, build) {
      if (err) return cb(err)

      log.info('')
      log.info(`Build #${build.buildNum} started...\n`)

      build.logUrl = log.initBuildLog(build)

      log.info(`Build log: ${build.logUrl}\n`)

      if (build.token) {
        github.createClient(build)
      }

      if (build.config.notifications.slack && build.config.secretEnv.SLACK_TOKEN) {
        slack.createClient(build.config.secretEnv.SLACK_TOKEN, build.config.notifications.slack, build)
      }

      if (build.config.notifications.sns) {
        sns.createClient(build.config.notifications.sns, build)
      }

      var done = patchUncaughtHandlers(build, cb)

      build.statusEmitter.emit('start', build)

      // TODO: must be a better place to put this?
      build.config.env.LAMBCI_BUILD_NUM = build.buildNum

      if (build.config.docker) {
        dockerBuild(build, done)
      } else {
        lambdaBuild(build, done)
      }
    })
  })
}

function patchUncaughtHandlers(build, cb) {
  var origListeners = process.listeners('uncaughtException')
  var done = utils.once(function(err) {
    process.removeListener('uncaughtException', done)
    origListeners.forEach(listener => process.on('uncaughtException', listener))
    build.error = err
    buildDone(build, cb)
  })
  process.removeAllListeners('uncaughtException')
  process.on('uncaughtException', done)
  return done
}

function buildDone(build, cb) {
  var finishTasks = build.statusEmitter.finishTasks

  // Don't update statuses if we're doing a docker build and we launched successfully.
  // We still need to properly call finish tasks handlers for docker builds
  // to end the log uploader etc. and to properly shutdown the lambda.
  // Otherwise the lamdbda will keep uploading the log until the function times out.
  if (build.error || !build.config.docker) {
      log.info(build.error ? `Build #${build.buildNum} failed: ${build.error.message}` :
        `Build #${build.buildNum} successful!`)

      build.endedAt = new Date()
      build.status = build.error ? 'failure' : 'success'
      build.statusEmitter.emit('finish', build)

      finishTasks = finishTasks.concat(db.finishBuild)
  }

  async.forEach(finishTasks, (task, cb) => task(build, cb), function(taskErr) {
    log.logIfErr(taskErr)
    cb(build.error)
  })
}

function clone(build, cb) {

  // Just double check we're in tmp!
  if (build.cloneDir.indexOf(config.BASE_BUILD_DIR) !== 0) {
    return cb(new Error(`clone directory ${build.cloneDir} not in base directory ${config.BASE_BUILD_DIR}`))
  }

  build.token = build.config.secretEnv.GITHUB_TOKEN

  var cloneUrl = `https://github.com/${build.cloneRepo}.git`, maskCmd = cmd => cmd
  if (build.isPrivate && build.token) {
    cloneUrl = `https://${build.token}@github.com/${build.cloneRepo}.git`
    maskCmd = cmd => cmd.replace(new RegExp(build.token, 'g'), 'XXXX')
  }

  var depth = build.isRebuild ? '' : `--depth ${build.config.git.depth}`
  var cloneCmd = `git clone ${depth} ${cloneUrl} -b ${build.checkoutBranch} ${build.cloneDir}`
  var checkoutCmd = `cd ${build.cloneDir} && git checkout -qf ${build.commit}`

  // Bit awkward, but we don't want the token written to disk anywhere
  if (build.isPrivate && build.token && !build.config.inheritSecrets) {
    cloneCmd = [
      `mkdir -p ${build.cloneDir}`,
      `cd ${build.cloneDir} && git init && git pull ${depth} ${cloneUrl} ${build.checkoutBranch}`,
    ]
  }

  // No caching of clones for now – can revisit this if we want to – but for now, safer to save space
  var cmds = [`rm -rf ${config.BASE_BUILD_DIR}`].concat(cloneCmd, checkoutCmd)

  var env = prepareLambdaConfig({}).env
  var runCmd = (cmd, cb) => runInBash(cmd, {env: env, logCmd: maskCmd(cmd)}, cb)

  async.forEachSeries(cmds, runCmd, cb)
}

function lambdaBuild(build, cb) {

  build.config = prepareLambdaConfig(build.config)

  var opts = {
    cwd: build.cloneDir,
    env: config.resolveEnv(build.config),
  }

  runInBash(build.config.cmd, opts, cb)
}

function runInBash(cmd, opts, cb) {
  // Would love to create a pseudo terminal here, but /dev/pts doesn't exist on Lambda
  /*
  var proc = require('node-pty').spawn('/bin/bash', ['-c', config.cmd], {
    name: 'xterm-256color',
    cwd: cloneDir,
    env: env,
  })
  proc.socket.setEncoding(null)
  if (proc.socket._readableState) {
    delete proc.socket._readableState.decoder
    delete proc.socket._readableState.encoding
  }
  */

  var logCmd = opts.logCmd || cmd
  delete opts.logCmd

  log.info(`$ ${logCmd}`)

  var proc = spawn('/opt/bin/bash', ['-c', cmd], opts)
  proc.stdout.pipe(utils.lineStream(log.info))
  proc.stderr.pipe(utils.lineStream(log.error))
  proc.on('error', cb)
  proc.on('close', function(code) {
    var err
    if (code) {
      err = new Error(`Command "${logCmd}" failed with code ${code}`)
      err.code = code
      err.logTail = log.getTail()
    }
    cb(err)
  })
}

function dockerBuild(build, cb) {
  var ECS_CLUSTER = build.config.docker.cluster || config.STACK
  var ECS_TASK_DEFINITION = build.config.docker.task || `${config.STACK}-BuildTask`
  var ECS_CONTAINER = build.config.docker.container || 'build'

  build.config = prepareDockerConfig(build.config)

  var cmd = build.config.docker.containerCmd
  var env = config.resolveEnv(build.config)

  var ecsEnv = Object.keys(env).map(function(key) {
    return {name: key, value: env[key] == null ? '' : String(env[key])}
  })
  var containerOverrides = {
    name: ECS_CONTAINER,
    environment: ecsEnv,
  }
  if (cmd) containerOverrides.command = ['bash', '-c', cmd]

  log.info(`Running task ${ECS_TASK_DEFINITION}${cmd ? ` with cmd ${cmd}` : ''} on ECS cluster ${ECS_CLUSTER}`)

  // On permission failure:
  // {"failures":[{"arn":"arn:aws:ecs:us-east-1:999000111222:container-instance/e79f47fe-8354-4a8c-b37c-15a24ad27895","reason":"AGENT"}],"tasks":[]}

  return ecs.runTask({
    cluster: ECS_CLUSTER,
    taskDefinition: ECS_TASK_DEFINITION,
    overrides: {containerOverrides: [containerOverrides]},
  }, cb)
}

// For when executing under Lambda (but not ECS/Docker)
function prepareLambdaConfig(buildConfig) {

  var defaultLambdaConfig = {
    env: {
      HOME: config.HOME_DIR,
      SHELL: '/opt/bin/bash',
      PATH: [
        path.join(config.HOME_DIR, '.local/bin'),
        path.join(config.HOME_DIR, 'usr/bin'),
        path.join(__dirname, '../node_modules/.bin'),
        '/opt/bin',
        process.env.PATH,
      ].join(':'),
      LD_LIBRARY_PATH: [
        path.join(config.HOME_DIR, 'usr/lib64'),
        process.env.LD_LIBRARY_PATH,
      ].join(':'),
      NODE_PATH: process.env.NODE_PATH,
      PYTHONPATH: [
        path.join(config.HOME_DIR, '.local/lib/python3.6/site-packages'),
        '/opt/lib/python3.6/site-packages',
      ].join(':'),
      PERL5LIB: '/opt/share/perl5/vendor_perl:/opt/lib/perl5/vendor_perl',

      // To try to get colored output
      TERM: 'xterm-256color',
      FORCE_COLOR: true,
      NPM_CONFIG_COLOR: 'always',
      MOCHA_COLORS: true,
    },
    secretEnv: {
      AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
      AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
      AWS_SESSION_TOKEN: process.env.AWS_SESSION_TOKEN,
      AWS_REGION: process.env.AWS_REGION,
    },
  }

  // Treat PATH variables specially
  var pathEnvVars = ['PATH', 'LD_LIBRARY_PATH', 'NODE_PATH']
  pathEnvVars.forEach(key => {
    if (buildConfig.env && buildConfig.env[key]) {
      buildConfig.env[key] = [buildConfig.env[key], defaultLambdaConfig[key]].join(':')
    }
  })

  return utils.merge(defaultLambdaConfig, buildConfig)
}

// For when executing under ECS/Docker (but not Lambda)
function prepareDockerConfig(buildConfig) {
  var dockerConfig = buildConfig.docker
  var slackConfig = buildConfig.notifications.slack || {}
  var defaultDockerConfig = {
    env: {
      STACK: config.STACK,
      LAMBCI_DOCKER_CMD: dockerConfig.cmd,
      LAMBCI_DOCKER_FILE: dockerConfig.file,
      LAMBCI_DOCKER_TAG: dockerConfig.tag,
      LAMBCI_DOCKER_BUILD_ARGS: dockerConfig.buildArgs,
      LAMBCI_DOCKER_RUN_ARGS: dockerConfig.runArgs,
      SLACK_CHANNEL: slackConfig.channel,
      SLACK_USERNAME: slackConfig.username,
      SLACK_ICON_URL: slackConfig.iconUrl,
      SLACK_AS_USER: slackConfig.asUser || '',
    },
  }
  return utils.merge(defaultDockerConfig, buildConfig)
}
