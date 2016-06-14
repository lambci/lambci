var path = require('path')
var fs = require('fs')
var execSync = require('child_process').execSync
var utils = require('.')

// Function name is often something like `lambci-build` or `lambci-build-ET00B7R7T0AN`
// So this will usually resolve to `lambci`
exports.STACK = (process.env.AWS_LAMBDA_FUNCTION_NAME || 'lambci').replace(/-.+$/, '')

exports.VERSION = require('../package.json').version

exports.BASE_DIR = path.join('/tmp', exports.STACK) // eg: /tmp/lambci
exports.HOME_DIR = path.join(exports.BASE_DIR, 'home') // eg: /tmp/lambci/home
exports.BASE_BUILD_DIR = path.join(exports.BASE_DIR, 'build') // eg: /tmp/lambci/build

// Config Order (lowest to highest precedence):
// DEFAULT_CONFIG (below)
// 'global' config from DynamoDB
// 'gh/<owner>/<reponame>' config from DynamoDB
// package.json file with 'lambci' key
// .lambci.js or .lambci.json file

exports.DEFAULT_CONFIG = {
  cmd: 'npm install && npm test',
  // cmd: 'nave use 6 bash -c "env && node --version && npm --version && npm install && npm test"',
  env: {
  },
  secretEnv: {
    GITHUB_TOKEN: '',
    SLACK_TOKEN: '',
  },
  inheritSecrets: true,
  allowConfigOverrides: true,
  notifications: {
    slack: {
      channel: '#general',
      username: 'LambCI',
      asUser: false,
    },
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
}

exports.initSync = function() {
  execSync(`mkdir -p ${exports.HOME_DIR}`)
  execSync(`cp -r ${__dirname}/../home/. ${exports.HOME_DIR}`)
}

exports.initConfig = function(configs, build) {
  var allConfigs = [Object.create(null), exports.DEFAULT_CONFIG].concat(configs || [])
  return resolveBranchConfig(utils.merge.apply(null, allConfigs), build)
}

// Add build-specific env vars and resolve file configs
exports.prepareBuildConfig = function(config, build) {
  var buildConfig = {
    env: {
      CI: true,
      LAMBCI: true,
      LAMBCI_REPOSITORY: build.repo,
      LAMBCI_BRANCH: build.branch,
      LAMBCI_CLONE_URL: build.cloneUrl,
      LAMBCI_CHECKOUT_BRANCH: build.checkoutBranch,
      LAMBCI_COMMIT: build.commit,
      LAMBCI_PULL_REQUEST: build.prNum || '',
      AWS_REQUEST_ID: build.requestId,
    },
  }
  return utils.merge(exports.resolveFileConfigs(config, build), buildConfig)
}

exports.resolveFileConfigs = function(config, build) {
  return resolveBranchConfig(resolveFileConfig(config, build.cloneDir), build)
}

exports.resolveEnv = function(config) {
  var secretEnv = config.inheritSecrets && config.secretEnv
  return utils.merge(Object.create(null), config.env, secretEnv || {})
}

function resolveBranchConfig(config, build) {
  var configObj, key

  if (build.eventType == 'pull_request') {
    var pullRequests = config.pullRequests

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
    var branches = config.branches

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
    config = utils.merge(Object.create(null), config, configObj)
  }
  return config
}

function resolveFileConfig(config, cloneDir) {
  var packageConfig, dotConfig

  if (!config.allowConfigOverrides) return config

  try {
    var packageJson = JSON.parse(fs.readFileSync(path.join(cloneDir, 'package.json'), 'utf8'))
    packageConfig = packageJson.lambci
  } catch (e) {
    packageConfig = undefined
  }

  try {
    // Only use `require` if we're in a safe environment
    // It will look for .lambci.js and .lambci.json
    dotConfig = config.inheritSecrets ? require(path.join(cloneDir, '.lambci')) :
      JSON.parse(fs.readFileSync(path.join(cloneDir, '.lambci.json'), 'utf8'))
  } catch (e) {
    dotConfig = undefined
  }

  var fileConfig = utils.merge(Object.create(null), packageConfig, dotConfig)

  if (Array.isArray(config.allowConfigOverrides)) {
    fileConfig = config.allowConfigOverrides.reduce((obj, key) => {
      obj[key] = fileConfig[key]
      return obj
    }, {})
  }

  return utils.merge(Object.create(null), config, fileConfig)
}

