var path = require('path')
var spawn = require('child_process').spawn
var async = require('async')
var AWS = require('aws-sdk')
var utils = require('../utils')
var log = require('../utils/log')
var configUtils = require('../utils/config')
var db = require('../db')
var github = require('../sources/github')
var slack = require('../notifications/slack')
var sns = require('../notifications/sns')

var ecs = new AWS.ECS()

module.exports = runBuild

function runBuild(build, context, cb) {
  // TODO: figure out whether to use mergeable or not

  build.requestId = context.awsRequestId
  build.logGroupName = context.logGroupName
  build.logStreamName = context.logStreamName

  // Sometimes errors will occur that we don't catch, and Lambda will retry those requests,
  // so check if we've seen this request ID before, and if so, ignore it
  async.parallel({
    retry: (cb) => db.checkIfRetry(build, cb),
    configs: (cb) => db.getConfigs(['global', build.project], cb),
    checkVersion: configUtils.checkVersion,
  }, function(err, data) {
    if (err) return cb(err)

    if (data.retry) {
      log.info(`Ignoring retry request for build #${data.buildNum}`)
      return cb() // TODO: Ensure Github/Slack statuses are 'finished' too
    }

    var config = configUtils.initConfig(data.configs, build)

    // If config says we can't build, and we can't override, then we're done
    if (!config.build && !config.allowConfigOverrides) {
      log.info('config.build set to false and cannot override – not running build')
      return cb()
    }

    cloneAndBuild(build, config, cb)
  })
}

function cloneAndBuild(build, config, cb) {

  build.token = config.secretEnv.GITHUB_TOKEN
  build.cloneDir = path.join(configUtils.BASE_BUILD_DIR, build.repo)

  clone(build, config, function(err) {
    if (err) return cb(err)

    // Now that we've cloned the repository we can check for config files
    config = configUtils.prepareBuildConfig(config, build)

    if (!config.build) {
      log.info('config.build set to false – not running build')
      return cb()
    }

    db.initBuild(build, function(err, build) {
      if (err) return cb(err)

      build.logUrl = log.initBuildLog(config, build)

      if (build.token) {
        github.createClient(build)
      }

      if (config.notifications.slack && config.secretEnv.SLACK_TOKEN) {
        slack.createClient(config.secretEnv.SLACK_TOKEN, config.notifications.slack, build)
      }

      if (config.notifications.sns) {
        sns.createClient(config.notifications.sns, build)
      }

      var done = patchUncaughtHandlers(build, config, cb)

      log.info(`Build #${build.buildNum} started...`)
      log.info(`Logging to: ${build.logUrl}`)

      build.statusEmitter.emit('start', build)

      if (config.docker) {
        dockerBuild(config, done)
      } else {
        lambdaBuild(build, config, done)
      }
    })
  })
}

function patchUncaughtHandlers(build, config, cb) {
  var origListeners = process.listeners('uncaughtException')
  var done = utils.once(function(err, data) {
    process.removeListener('uncaughtException', done)
    origListeners.forEach(listener => process.on('uncaughtException', listener))
    buildDone(err, data, build, config, cb)
  })
  process.removeAllListeners('uncaughtException')
  process.on('uncaughtException', done)
  return done
}

function buildDone(err, data, build, config, cb) {

  // Don't update statuses if we're doing a docker build and we launched successfully
  if (!err && config.docker) return cb(null, data)

  log.info(err ? `Build #${build.buildNum} failed: ${err.message}` :
    `Build #${build.buildNum} successful!`)

  build.status = err ? 'failure' : 'success'
  build.statusEmitter.emit('finish', err, build)

  cb(err, data)
}

function clone(build, config, cb) {

  // Just double check we're in tmp!
  if (build.cloneDir.indexOf(configUtils.BASE_BUILD_DIR) !== 0) return

  var cloneUrl = build.cloneUrl, maskCmd = cmd => cmd
  if (build.isPrivate && build.token) {
    cloneUrl = cloneUrl.replace('//github.com', `//${build.token}@github.com`)
    maskCmd = cmd => cmd.replace(new RegExp(build.token, 'g'), 'XXXX')
  }

  var cloneCmd = `git clone --depth 5 ${cloneUrl} -b ${build.checkoutBranch} ${build.cloneDir}`
  var checkoutCmd = `cd ${build.cloneDir} && git checkout -qf ${build.commit}`

  // Bit awkward, but we don't want the token written to disk anywhere
  if (build.isPrivate && build.token && !config.inheritSecrets) {
    cloneCmd = [
      `mkdir -p ${build.cloneDir}`,
      `cd ${build.cloneDir} && git init && git pull --depth 5 ${cloneUrl} ${build.checkoutBranch}`,
    ]
  }

  // No caching of clones for now – can revisit this if we want to
  var cmds = [`rm -rf ${configUtils.BASE_BUILD_DIR}`].concat(cloneCmd, checkoutCmd)

  log.info(`Cloning ${build.cloneUrl} with branch ${build.checkoutBranch}`)

  var env = prepareLambdaConfig({}).env
  var runCmd = (cmd, cb) => runInBash(cmd, {env: env, logCmd: maskCmd(cmd)}, build, cb)

  async.forEachSeries(cmds, runCmd, cb)
}

function lambdaBuild(build, config, cb) {

  config = prepareLambdaConfig(config)

  var opts = {
    cwd: build.cloneDir,
    env: configUtils.resolveEnv(config),
  }

  runInBash(config.cmd, opts, build, cb)
}

function runInBash(cmd, opts, build, cb) {
  // Would love to create a pseudo terminal here (pty), but don't have permissions in Lambda
  /*
  var proc = require('pty.js').spawn('/bin/bash', ['-c', config.cmd], {
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

  var logStream = log.getBuildStream(build)
  var proc = spawn('/bin/bash', ['-c', cmd], opts)
  proc.stdout.pipe(process.stdout)
  proc.stdout.pipe(logStream)
  proc.stderr.pipe(process.stderr)
  proc.stderr.pipe(logStream)
  proc.on('error', cb)
  proc.on('close', function(code) {
    var err
    if (code) {
      err = new Error(`Command "${logCmd}" failed with code ${code}`)
      err.code = code
      err.logTail = log.getTail(build)
    }
    cb(err)
  })
}

function dockerBuild(config, cb) {
  var ECS_CLUSTER = configUtils.STACK
  var ECS_TASK_DEFINITION = `${configUtils.STACK}-build`
  var ECS_CONTAINER = 'build'

  config = prepareDockerConfig(config)

  var cmd = config.docker.containerCmd
  var env = configUtils.resolveEnv(config)

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
function prepareLambdaConfig(config) {

  var usrDir = `${configUtils.HOME_DIR}/usr`
  var defaultLambdaConfig = {
    env: {
      HOME: configUtils.HOME_DIR,
      SHELL: '/bin/bash',
      PATH: `${usrDir}/bin:${process.env.PATH}`,
      LD_LIBRARY_PATH: `${usrDir}/lib64:${process.env.LD_LIBRARY_PATH}`,
      NODE_PATH: process.env.NODE_PATH,
      GIT_TEMPLATE_DIR: `${usrDir}/share/git-core/templates`,
      GIT_EXEC_PATH: `${usrDir}/libexec/git-core`,

      // To try to get colored output
      NPM_CONFIG_COLOR: 'always',
      TERM: 'xterm-256color',
      FORCE_COLOR: true,
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
    if (config.env && config.env[key]) {
      config.env[key] = [config.env[key], defaultLambdaConfig[key]].join(':')
    }
  })

  return utils.merge(defaultLambdaConfig, config)
}

// For when executing under ECS/Docker (but not Lambda)
function prepareDockerConfig(config) {
  var defaultDockerConfig = {
    env: {
      LAMBCI_DOCKER_CMD: config.docker.cmd,
      LAMBCI_DOCKER_FILE: config.docker.file,
      LAMBCI_DOCKER_TAG: config.docker.tag,
      LAMBCI_DOCKER_BUILD_ARGS: config.docker.buildArgs,
      LAMBCI_DOCKER_RUN_ARGS: config.docker.runArgs,
    },
  }
  return utils.merge(defaultDockerConfig, config)
}

