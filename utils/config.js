var path = require('path')
var fs = require('fs')
var execSync = require('child_process').execSync
var utils = require('.')
var log = require('./log')

// Function name is often something like `lambci-build` or `lambci-public-build`
// So this will usually resolve to `lambci` or `lambci-public` or similar
exports.STACK = (process.env.AWS_LAMBDA_FUNCTION_NAME || 'lambci').replace(/-build.*$/, '')

exports.VERSION = require('../package.json').version

// This is used to check latest pkg version – feel free to remove if you don't want this
exports.CHECK_VERSION_URL = `https://lambci.s3.amazonaws.com/fn/latest.txt?x-lambci-version=${exports.VERSION}`

exports.BASE_DIR = '/tmp/lambci'
exports.HOME_DIR = path.join(exports.BASE_DIR, 'home') // eg: /tmp/lambci/home
exports.BASE_BUILD_DIR = path.join(exports.BASE_DIR, 'build') // eg: /tmp/lambci/build

// Config Order (lowest to highest precedence):
// DEFAULT_CONFIG (below)
// 'global' config from DynamoDB
// 'gh/<owner>/<reponame>' config from DynamoDB
// package.json file with 'lambci' key
// .lambci.js or .lambci.json file

exports.DEFAULT_CONFIG = {
  //cmd: 'npm install && npm test',
  cmd: 'pip install --user tox && tox',
  env: {
  },
  secretEnv: {
    GITHUB_TOKEN: '',
    SLACK_TOKEN: '',
  },
  s3Bucket: '',
  notifications: {
    slack: {
      channel: '#general',
      username: 'LambCI',
      iconUrl: 'https://lambci.s3.amazonaws.com/assets/logo-48x48.png',
      asUser: false,
    },
    // Example SNS notifications config:
    // sns: {
      // topicArn: 'arn:aws:sns:us-east-1:1234:lambci-StatusTopic-1WF8BT36',
    // },
  },
  build: false, // Build nothing by default except master and PRs
  branches: {
    master: true,
  },
  pullRequests: {
    fromSelfPublicRepo: true,
    fromSelfPrivateRepo: true,
    fromForkPublicRepo: {
      build: true,
      inheritSecrets: false,
      allowConfigOverrides: ['cmd', 'env'],
    },
    fromForkPrivateRepo: false,
  },
  s3PublicSecretNames: true,
  inheritSecrets: true,
  allowConfigOverrides: true,
  clearTmp: true,
  git: {
    depth: 5,
  },
}

exports.initSync = function(config) {
  // If we're in potentially unsafe environments (eg, we run public builds),
  // then we don't want ppl messing with *anything* in /tmp, so we blow it away each time
  // Can set `clearTmp` to avoid recreating the HOME_DIR, etc each time
  if (config.clearTmp) {
    // Don't have permissions to delete /tmp but can delete everything in it
    // Could also do `find ... -delete` for all files, but this is quicker
    execSync('find /tmp -mindepth 1 -maxdepth 1 -exec rm -rf {} +')
  }
  // The git executables blow up in size when zipped for some reason,
  // so we leave them tarred and untar in /tmp/...
  // TODO: figure out if there's a way around this
  // TODO: is there anything else we want to add in home?
  execSync(`
    if ! [ -d ${exports.HOME_DIR} ]; then
      mkdir -p ${exports.HOME_DIR}
      cp -r ${__dirname}/../home/. ${exports.HOME_DIR}
      tar -C ${exports.HOME_DIR} -xf ${__dirname}/../vendor/git-2.4.3.tar
    fi
  `)
}

exports.initConfig = function(configs, build) {
  var allConfigs = [Object.create(null), exports.DEFAULT_CONFIG].concat(configs || [])
  build.config = utils.merge.apply(null, allConfigs)
  return resolveBranchConfig(build)
}

// Add build-specific env vars and resolve file configs
exports.prepareBuildConfig = function(build) {
  var buildConfig = {
    env: {
      CI: true,
      LAMBCI: true,
      LAMBCI_REPO: build.repo,
      LAMBCI_BRANCH: build.branch,
      LAMBCI_CLONE_REPO: build.cloneRepo,
      LAMBCI_CHECKOUT_BRANCH: build.checkoutBranch,
      LAMBCI_COMMIT: build.commit,
      LAMBCI_PULL_REQUEST: build.prNum || '',
      AWS_REQUEST_ID: build.requestId,
    },
  }
  return utils.merge(exports.resolveFileConfigs(build), buildConfig)
}

exports.resolveFileConfigs = function(build) {
  build.config = resolveFileConfig(build)
  return resolveBranchConfig(build)
}

exports.resolveEnv = function(config) {
  var secretEnv = config.inheritSecrets && config.secretEnv
  return utils.merge(Object.create(null), config.env, secretEnv || {})
}

exports.checkVersion = function(cb) {
  if (!exports.CHECK_VERSION_URL) return cb()
  utils.request(exports.CHECK_VERSION_URL, function(err, res, body) {
    if (err || res.statusCode != 200) {
      log.error('Could not fetch latest LambCI version: %s', err || body)
      return cb()
    }
    var latestVersion = body.trim()
    if (utils.semverCmp(exports.VERSION, latestVersion) < 0) {
      log.info(`Your LambCI version is out of date. Latest is: v${latestVersion}\n`)
    }
    cb(null, latestVersion)
  })
}

function resolveBranchConfig(build) {
  var configObj, key

  if (build.eventType == 'pull_request') {
    var pullRequests = build.config.pullRequests

    if (typeof pullRequests == 'boolean') {
      configObj = pullRequests
    } else {
      pullRequests = pullRequests || {}
      key = build.isFork ?
        (build.isPrivate ? 'fromForkPrivateRepo' : 'fromForkPublicRepo') :
        (build.isPrivate ? 'fromSelfPrivateRepo' : 'fromSelfPublicRepo')
      configObj = pullRequests[key]
    }
  } else { // eventType == 'push'
    var branches = build.config.branches

    if (typeof branches == 'boolean') {
      configObj = branches
    } else {
      branches = branches || {}
      configObj = branches[build.branch]
      if (configObj == null) {
        key = Object.keys(branches).find(branch => {
          var match = branch.match(/^!?\/(.+)\/$/)
          if (!match) return false
          var keyMatches = new RegExp(match[1]).test(build.branch)
          return branch[0] == '!' ? !keyMatches : keyMatches
        })
        configObj = branches[key]
      }
    }
  }
  if (typeof configObj == 'boolean') {
    configObj = {build: configObj}
  }
  if (typeof configObj == 'object' && configObj) {
    build.config = utils.merge(Object.create(null), build.config, configObj)
  }
  return build.config
}

function resolveFileConfig(build) {
  var packageConfig, dotConfig

  if (!build.config.allowConfigOverrides) return build.config

  try {
    var packageJson = JSON.parse(fs.readFileSync(path.join(build.cloneDir, 'package.json'), 'utf8'))
    packageConfig = packageJson.lambci
  } catch (e) {
    packageConfig = undefined
  }

  try {
    // Only use `require` if we're in a safe environment
    // It will look for .lambci.js and .lambci.json
    if (build.config.inheritSecrets) {
      var resolvedPath = require.resolve(path.join(build.cloneDir, '.lambci'))
      delete require.cache[resolvedPath] // Refresh each build
      dotConfig = require(resolvedPath)
    } else {
      dotConfig = JSON.parse(fs.readFileSync(path.join(build.cloneDir, '.lambci.json'), 'utf8'))
    }
  } catch (e) {
    dotConfig = undefined
  }

  var fileConfig = utils.merge(Object.create(null), packageConfig, dotConfig)

  if (Array.isArray(build.config.allowConfigOverrides)) {
    fileConfig = build.config.allowConfigOverrides.reduce((obj, key) => {
      if ({}.hasOwnProperty.call(fileConfig, key)) obj[key] = fileConfig[key]
      return obj
    }, {})
  }

  return utils.merge(Object.create(null), build.config, fileConfig)
}

