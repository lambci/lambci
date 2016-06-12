var path = require('path')
var spawn = require('child_process').spawn
var execSync = require('child_process').execSync
var async = require('async')
var AWS = require('aws-sdk')
var nodegit = require('nodegit')
var utils = require('../utils')
var log = require('../utils/log')
var configUtils = require('../utils/config')
var db = require('../db')
var github = require('../sources/github')
var slack = require('../notifications/slack')

var ecs = new AWS.ECS()

module.exports = runBuild

function runBuild(build, context, cb) {
  // TODO: figure out whether to use mergeable or not

  build.requestId = context.awsRequestId
  build.logGroupName = context.logGroupName
  build.logStreamName = context.logStreamName

  // Sometimes errors will occur that we don't catch, and Lambda will retry those requests,
  // so check if we've seen this request ID before, and if so, ignore it
  db.checkIfRetry(build, function(err, data) {
    if (err) return cb(err)
    if (data) {
      log.info(`Ignoring retry request for build #${data.buildNum}`)
      return cb() // TODO: Ensure Github/Slack statuses are 'finished' too
    }

    cloneAndBuild(build, cb)
  })

}

function cloneAndBuild(build, cb) {

  async.parallel({
    build: (cb) => db.initBuild(build, cb),
    configs: (cb) => db.getConfigs(['global', build.project], cb),
  }, function(err, data) {
    if (err) return cb(err)

    var config = configUtils.initConfig(data.configs, build)

    if (!config.build) {
      log.info('config.build set to false – not running build')
      return cb()
    }

    build.token = config.secretEnv.GITHUB_TOKEN
    build.logUrl = log.initBuildLog(config, build)
    build.cloneDir = path.join(configUtils.BASE_BUILD_DIR, build.repo, build.branch)

    github.createClient(build)

    slack.createClient(config.secretEnv.SLACK_TOKEN, config.notifications.slack, build)

    var origListeners = process.listeners('uncaughtException')
    var done = utils.once(function(err, data) {
      process.removeListener('uncaughtException', done)
      origListeners.forEach(listener => process.on('uncaughtException', listener))
      buildDone(err, data, build, config, cb)
    })
    process.removeAllListeners('uncaughtException')
    process.on('uncaughtException', done)

    log.info(`Build #${build.buildNum} started...`)
    log.info(`Logging to: ${build.logUrl}`)

    build.statusEmitter.emit('start', build)

    clone(build, function(err) {
      if (err && /^Reference .+ not found$/.test(err.message)) {
        err = new Error(`Could not find branch ${build.checkoutBranch} on ${build.cloneUrl}`)
      }
      if (err && /^Object not found/.test(err.message)) {
        err = new Error(`Could not find commit ${build.commit} on ${build.cloneUrl}`)
      }
      if (err) return done(err)

      // Now that we've cloned the repository we can check for config files
      config = configUtils.prepareBuildConfig(config, build)

      if (config.docker) {
        dockerBuild(config, done)
      } else {
        lambdaBuild(build, config, done)
      }
    })
  })
}

function buildDone(err, data, build, config, cb) {

  // Don't update statuses if we're doing a docker build and we launched successfully
  if (!err && config.docker) return cb(null, data)

  log.info(err ? `Build #${build.buildNum} failed: ${err.message}` :
    `Build #${build.buildNum} successful!`)

  build.statusEmitter.emit('finish', err, build)

  cb(err, data)
}

function clone(build, cb) {

  // Just double check we're in tmp!
  if (build.cloneDir.indexOf(configUtils.BASE_BUILD_DIR) !== 0) return

  // No caching of clones for now – can revisit this if we want to
  execSync(`rm -rf ${configUtils.BASE_BUILD_DIR}`)

  log.info(`Cloning ${build.cloneUrl} with branch ${build.checkoutBranch}`)

  /* eslint new-cap:0 */
  nodegit.Clone(
    build.cloneUrl,
    build.cloneDir,
    {
      checkoutBranch: build.checkoutBranch,
      fetchOpts: {
        callbacks: {
          credentials: build.token && build.isPrivate ?
            function() { return nodegit.Cred.userpassPlaintextNew(build.token, 'x-oauth-basic') } : undefined,
          // NodeGit still has issues with github certificates
          certificateCheck: build.cloneUrl.indexOf('https://github.com/') === 0 ?
            function() { return 1 } : undefined,
        },
      },
    }
  ).then(function(repo) {
    log.info(`Looking up branch ${build.checkoutBranch}, commit ${build.commit}`)
    return nodegit.Object.lookup(repo, build.commit, nodegit.Object.TYPE.COMMIT)
  }).then(function(obj) {
    log.info('Hard resetting')
    return nodegit.Reset.reset(obj.owner(), obj, nodegit.Reset.TYPE.HARD)
  })
  .done(() => cb(), (err) => cb(err))
}

function lambdaBuild(build, config, cb) {

  config = prepareLambdaConfig(config)

  var cmd = config.cmd
  var env = configUtils.resolveEnv(config)

  log.info(`$ ${cmd}`)

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

  var logStream = log.getBuildStream(build)
  var proc = spawn('/bin/bash', ['-c', cmd], {
    cwd: build.cloneDir,
    env: env,
  })
  proc.stdout.pipe(process.stdout)
  proc.stdout.pipe(logStream)
  proc.stderr.pipe(process.stderr)
  proc.stderr.pipe(logStream)
  proc.on('error', cb)
  proc.on('close', function(code) {
    var err
    if (code) {
      err = new Error(`Command "${cmd}" failed with code ${code}`)
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

  var defaultLambdaConfig = {
    env: {
      HOME: configUtils.HOME_DIR,
      SHELL: '/bin/bash',
      PATH: process.env.PATH,
      LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH,
      NODE_PATH: process.env.NODE_PATH,

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
      config.env[key] = [config.env[key], process.env[key]].join(':')
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

