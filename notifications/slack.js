var async = require('async')
var utils = require('../utils')
var config = require('../utils/config')
var log = require('../utils/log')

var USER_AGENT = config.STACK

exports.createClient = function(token, options, build) {
  return new SlackClient(token, options, build)
}

exports.SlackClient = SlackClient

function SlackClient(token, options, build) {
  this.token = token
  this.channel = options.channel
  this.username = options.username
  this.iconUrl = options.iconUrl
  this.asUser = options.asUser
  this.lastTs = null // Most recent timestamp

  this.repo = build.repo
  this.branch = build.branch
  this.prNum = build.prNum
  this.commit = build.commit
  this.logUrl = build.logUrl

  this.statusQueue = async.queue(this.updateStatus.bind(this), 1)

  build.statusEmitter.on('start', (build) => {
    var status = {
      color: 'warning',
      fallback: `Started: ${build.repo} #${build.buildNum}`,
      title: `Build #${build.buildNum} started...`,
    }
    this.statusQueue.push(status, log.logIfErr)
  })

  build.statusEmitter.finishTasks.push((build, cb) => {
    var status = {}, elapsedTxt = utils.elapsedTxt(build.startedAt, build.endedAt)
    if (build.error) {
      var txt = build.error.message
      if (build.error.logTail) {
        txt = `${build.error.logTail}\n${txt}`
      }

      status.color = 'danger'
      status.fallback = `Failed: ${build.repo} #${build.buildNum} (${elapsedTxt})`
      status.title = `Build #${build.buildNum} failed (${elapsedTxt})`
      status.text = '```' + txt.replace(/```/g, "'''") + '```' // TODO: not sure best way to escape ```
    } else {
      status.color = 'good'
      status.fallback = `Success: ${build.repo} #${build.buildNum} (${elapsedTxt})`
      status.title = `Build #${build.buildNum} successful (${elapsedTxt})`
    }
    this.statusQueue.push(status, function(err) {
      log.logIfErr(err)
      cb()
    })
  })
}

SlackClient.prototype.updateStatus = function(status, cb) {
  var attachment = {
    color: status.color, // good, warning, danger
    title: status.title,
    title_link: status.url || this.logUrl,
    fallback: status.fallback || status.title,
    fields: [{
      title: 'Repository',
      value: `<https://github.com/${this.repo}|${this.repo}>`,
      short: true,
    }, {
      title: this.prNum ? 'Pull Request' : 'Branch',
      value: this.prNum ? `<https://github.com/${this.repo}/pull/${this.prNum}|#${this.prNum}>` :
        `<https://github.com/${this.repo}/tree/${this.branch}|${this.branch}>`,
      short: true,
    }],
  }
  if (status.text) {
    attachment.text = status.text
    attachment.mrkdwn_in = ['text']
  }
  this.update({attachments: JSON.stringify([attachment])}, cb)
}

SlackClient.prototype.postMessage = function(body, cb) {
  body = body || {}
  body.token = body.token || this.token
  body.channel = body.channel || this.channel
  body.username = body.username || this.username
  body.icon_url = body.icon_url || this.iconUrl
  body.as_user = body.as_user || this.asUser

  this.request({path: '/api/chat.postMessage', body: body}, (err, data) => {
    if (err) return cb(err)

    // If we're using `this.channel`, it might be the public channel name –
    // so update it to be the encoded name (C024BE91L) as a number of endpoints
    // (eg, chat.update) need this instead of the public name
    if (data && data.channel && body.channel == this.channel && data.channel != this.channel) {
      this.channel = data.channel
    }
    // Update most recent timestamp
    if (data && data.ts) {
      this.lastTs = data.ts
    }
    cb(null, data)
  })
}

SlackClient.prototype.update = function(body, cb) {
  body = body || {}
  body.token = body.token || this.token
  body.channel = body.channel || this.channel // Must be the encoded ID, eg C024BE91L
  body.ts = body.ts || this.lastTs
  body.username = body.username || this.username
  body.icon_url = body.icon_url || this.iconUrl
  body.as_user = body.as_user || this.asUser

  if (!body.ts) {
    return this.postMessage(body, cb)
  }

  this.request({path: '/api/chat.update', body: body}, cb)
}

SlackClient.prototype.request = function(options, cb) {
  /* eslint dot-notation:0 */
  options.host = 'slack.com'
  options.headers = options.headers || {}
  options.headers['Accept'] = 'application/json'
  options.headers['User-Agent'] = USER_AGENT
  if (options.body) {
    options.headers['Content-Type'] = 'application/x-www-form-urlencoded'
  }
  utils.request(options, function(err, res, data) {
    if (err) return cb(err)
    if (res.statusCode >= 400) {
      err = new Error(data)
      err.statusCode = res.statusCode
      return cb(err)
    }
    var json
    try {
      json = JSON.parse(data)
    } catch (e) {
      e.body = data
      return cb(e)
    }
    if (!json.ok) {
      return cb(new Error(json.error || data))
    }
    cb(null, json)
  })
}

