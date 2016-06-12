var async = require('async')
var utils = require('../utils')
var config = require('../utils/config')
var log = require('../utils/log')

var USER_AGENT = config.STACK

// From https://github.com/chalk/ansi-regex
var ANSI_REGEX = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g

exports.createClient = function(token, options, build) {
  return new SlackClient(token, options, build)
}

exports.SlackClient = SlackClient

function SlackClient(token, options, build) {
  this.token = token
  this.channel = options.channel || '#general'
  this.username = options.username || 'LambCI'
  this.asUser = options.asUser || false
  this.lastTs = null // Most recent timestamp

  this.repo = build.repo
  this.branch = build.branch
  this.prNum = build.prNum
  this.commit = build.commit
  this.logUrl = build.logUrl

  this.statusQueue = async.queue(this.updateStatus.bind(this), 1)

  build.statusEmitter.on('start', (buildInfo) => {
    var status = {
      color: 'warning',
      title: `Build #${buildInfo.buildNum} started...`,
    }
    this.statusQueue.push(status, log.logIfErr)
  })

  build.statusEmitter.on('finish', (err, buildInfo) => {
    var status = {}
    if (err) {
      var txt = err.message
      if (err.logTail) {
        txt = `...\n${err.logTail.replace(ANSI_REGEX, '')}\n` + txt
      }

      status.color = 'danger'
      status.title = `Build #${buildInfo.buildNum} failed`
      status.text = '```' + txt.replace(/```/g, "'''") + '```' // TODO: not sure best way to escape ```
    } else {
      status.color = 'good'
      status.title = `Build #${buildInfo.buildNum} successful!`
    }
    this.statusQueue.push(status, log.logIfErr)
  })
}

SlackClient.prototype.updateStatus = function(status, cb) {
  var attachment = {
    color: status.color, // good, warning, danger
    title: status.title,
    title_link: status.url || this.logUrl,
    fallback: status.title,
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
  body.as_user = body.as_user || this.asUser
  body.icon_url = body.icon_url || 'https://s3-us-west-2.amazonaws.com/slack-files2/bot_icons/2015-05-27/5102998449_48.png'

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
  body.as_user = body.as_user || this.asUser
  body.icon_url = body.icon_url || 'https://s3-us-west-2.amazonaws.com/slack-files2/bot_icons/2015-05-27/5102998449_48.png'

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

