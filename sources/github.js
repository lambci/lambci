var async = require('async')
var utils = require('../utils')
var config = require('../utils/config')
var log = require('../utils/log')

var USER_AGENT = config.STACK
var STATUS_CONTEXT = `continuous-integration/${config.STACK}`

exports.createClient = function(build) {
  return new GithubClient(build)
}

exports.GithubClient = GithubClient

function GithubClient(build) {
  this.token = build.token
  this.repo = build.repo
  this.commit = build.commit
  this.logUrl = build.logUrl

  this.statusQueue = async.queue(this.updateStatus.bind(this), 1)

  if (!build.statusEmitter) return

  build.statusEmitter.on('start', (build) => {
    var status = {
      state: 'pending',
      description: `Build #${build.buildNum} started...`,
    }
    this.statusQueue.push(status, log.logIfErr)
  })

  build.statusEmitter.finishTasks.push((build, cb) => {
    var status = {
      state: build.error ? 'failure' : 'success',
      description: build.error ? build.error.message : `Build #${build.buildNum} successful!`,
    }
    this.statusQueue.push(status, function(err) {
      log.logIfErr(err)
      cb()
    })
  })
}

GithubClient.prototype.updateStatus = function(status, cb) {
  status = status || {}
  status.state = status.state || 'pending'
  status.description = status.description || ''
  status.target_url = status.target_url || this.logUrl
  status.context = status.context || STATUS_CONTEXT
  this.request({path: `/repos/${this.repo}/statuses/${this.commit}`, body: status}, cb)
}

// By default this will just ensure that the SNS hook listens for push & pull_request
GithubClient.prototype.updateSnsHook = function(options, cb) {
  options = options || {events: ['push', 'pull_request']}
  var getHookId = cb => options.id ? cb(null, options.id) : this.getSnsHook((err, hook) => cb(err, hook && hook.id))
  getHookId((err, id) => {
    if (err) return cb(err)
    this.updateHook(id, options, cb)
  })
}

GithubClient.prototype.deleteSnsHook = function(id, cb) {
  var getHookId = cb => id ? cb(null, id) : this.getSnsHook((err, hook) => cb(err, hook && hook.id))

  log.info(`Deleting SNS hook for ${this.repo}`)

  getHookId((err, id) => {
    if (err) return cb(err)
    if (!id) return cb()
    this.deleteHook(id, cb)
  })
}

GithubClient.prototype.getSnsHook = function(cb) {
  this.listHooks((err, data) => cb(err, data && data.find(hook => hook.name == 'amazonsns')))
}

GithubClient.prototype.createOrUpdateSnsHook = function(awsKey, awsSecret, snsTopic, cb) {
  var hook = {
    name: 'amazonsns',
    active: true,
    events: ['push', 'pull_request'],
    // https://github.com/github/github-services/blob/master/lib/services/amazon_sns.rb
    config: {
      aws_key: awsKey,
      aws_secret: awsSecret,
      sns_topic: snsTopic,
      sns_region: process.env.AWS_REGION,
    },
  }

  log.info(`Updating SNS hook for ${this.repo}`)

  this.createHook(hook, cb)
}

GithubClient.prototype.listHooks = function(cb) {
  this.request({path: `/repos/${this.repo}/hooks`}, cb)
}

// See: https://developer.github.com/v3/repos/hooks/#create-a-hook
// hook can be: {name: '', config: {}, events: [], active: true}
GithubClient.prototype.createHook = function(hook, cb) {
  this.request({path: `/repos/${this.repo}/hooks`, body: hook}, cb)
}

// See: https://developer.github.com/v3/repos/hooks/#edit-a-hook
// updates can be: {config: {}, events: [], add_events: [], remove_events: [], active: true}
GithubClient.prototype.updateHook = function(id, updates, cb) {
  this.request({method: 'PATCH', path: `/repos/${this.repo}/hooks/${id}`, body: updates}, cb)
}

// See: https://developer.github.com/v3/repos/hooks/#delete-a-hook
GithubClient.prototype.deleteHook = function(id, cb) {
  this.request({method: 'DELETE', path: `/repos/${this.repo}/hooks/${id}`}, cb)
}

GithubClient.prototype.request = function(options, cb) {
  /* eslint dot-notation:0 */
  options.host = 'api.github.com'
  options.headers = options.headers || {}
  options.headers['Accept'] = 'application/vnd.github.v3+json'
  options.headers['User-Agent'] = USER_AGENT
  if (options.body) {
    options.headers['Content-Type'] = 'application/vnd.github.v3+json'
  }
  if (this.token) {
    options.headers['Authorization'] = `token ${this.token}`
  }
  utils.request(options, function(err, res, data) {
    if (err) return cb(err)
    if (!data && res.statusCode < 400) return cb(null, {})

    var json
    try {
      json = JSON.parse(data)
    } catch (e) {
      err = new Error(data ? `Could not parse response: ${data}` : res.statusCode)
      err.statusCode = res.statusCode
      err.body = data
      return cb(err)
    }
    if (res.statusCode >= 400) {
      var errMsg = json.message || data
      if (res.statusCode == 401) {
        errMsg = 'GitHub token is invalid'
      } else if (res.statusCode == 404) {
        errMsg = 'GitHub token has insufficient privileges or repository does not exist'
      }
      err = new Error(errMsg)
      err.statusCode = res.statusCode
      err.body = json
      return cb(err)
    }
    cb(null, json)
  })
}

exports.parseEvent = function(event, eventType) {

  // Remove redundant fields like urls
  exports.trimEvent(event)

  // Log the git event for debugging
  log.raw(event)

  if (!~['push', 'pull_request'].indexOf(eventType)) {
    if (event.pull_request) {
      eventType = 'pull_request'
    } else if (event.pusher) {
      eventType = 'push'
    } else {
      throw new Error(`Unknown GitHub event type: ${eventType}`)
    }
  }

  if (!event.repository) {
    throw new Error('repository field is missing from GitHub event')
  }

  var build = {
    event,
    eventType,
    repo: event.repository.full_name,
    project: `gh/${event.repository.full_name}`,
    isPrivate: event.repository.private,
  }

  if (eventType == 'pull_request') {
    // https://developer.github.com/v3/activity/events/types/#pullrequestevent

    var prNum = event.number

    if (!event.pull_request) {
      throw new Error('pull_request field is missing from GitHub event')
    }
    if (event.pull_request.state == 'closed') {
      return {ignore: `Pull request #${prNum} is closed`}
    }
    if (!~['opened', 'reopened', 'synchronize'].indexOf(event.action)) {
      return {ignore: `Ignoring pull request #${prNum} action "${event.action}"`}
    }
    var base = event.pull_request.base || {}
    var head = event.pull_request.head || {}
    var baseRepo = base.repo || {}
    var headRepo = head.repo || {}

    // This should never happen
    if (baseRepo.full_name != build.repo) {
      throw new Error(`base repo ${baseRepo.full_name} is different from event repo ${build.repo}`)
    }

    build.branch = (base.ref || '').replace(/^refs\/heads\//, '')
    build.cloneRepo = headRepo.full_name
    build.checkoutBranch = (head.ref || '').replace(/^refs\/heads\//, '')
    build.commit = head.sha
    build.baseCommit = base.sha
    build.comment = event.pull_request.title || ''
    build.user = (event.pull_request.user || {}).login

    build.isFork = build.cloneRepo != build.repo
    build.prNum = prNum

  } else {
    // https://developer.github.com/v3/activity/events/types/#pushevent

    var branchMatch = (event.ref || '').match(/^refs\/(heads|tags)\/(.+)$/)

    if (!branchMatch) {
      return {ignore: `Ref does not match any branches: ${event.ref}`}
    }

    var branch = branchMatch[2]

    if (event.deleted) {
      return {ignore: `Branch ${branch} was deleted`}
    }

    build.branch = branch
    build.cloneRepo = build.repo
    build.checkoutBranch = branch
    build.commit = (event.head_commit || {}).id
    build.baseCommit = event.before
    build.comment = (event.head_commit || {}).message || ''
    build.user = (event.pusher || {}).name

    build.committers = new Set((event.commits || []).concat(event.head_commit || {}).reduce((committers, commit) => {
      if ((commit.author || {}).username) committers.push(commit.author.username)
      if ((commit.committer || {}).username) committers.push(commit.committer.username)
      return committers
    }, []))
  }

  if (!/^[a-zA-Z0-9-_.]+\/[a-zA-Z0-9-_.]+$/.test(build.repo)) {
    throw new Error(`Repository is invalid: ${build.repo}`)
  }

  if (!/^[0-9a-f]+$/.test(build.commit) || /^0+$/.test(build.commit)) {
    throw new Error(`Commit is invalid: ${build.commit}`)
  }

  return build
}

exports.trimEvent = function(event) {
  var deleteIfMatches = /^(url|_links)$|_url$/
  var whitelist = ['clone_url', 'avatar_url']
  Object.keys(event || {}).forEach(key => {
    if (deleteIfMatches.test(key) && !~whitelist.indexOf(key)) {
      delete event[key]
    } else if (event[key] && typeof event[key] == 'object') {
      exports.trimEvent(event[key])
    }
  })
}

