var crypto = require('crypto')
var AWS = require('aws-sdk')
var log = require('../utils/log')
var db = require('../db')
var github = require('./github')

var WEBHOOK_CONFIG_TTL = 60 * 1000 // Cache for 1 min to mitigate high request volume
var WEBHOOK_CONFIG = {
  secret: '',
  fetchedAt: 0,
}

var lambda = new AWS.Lambda()

exports.build = function(event, context, cb) {

  var done = function(err, data, statusCode) {
    log.logIfErr(err)
    cb(err, !err && {
      statusCode: statusCode || 200,
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(data || {}),
    })
  }

  var clientError = function(msg) {
    log.error(msg)
    done(null, {error: msg}, 400)
  }

  // Currently only GitHub is supported as a source
  var eventType = event.headers && event.headers['X-GitHub-Event']
  if (!eventType) return clientError('Missing X-GitHub-Event header')

  var signature = ((event.headers['X-Hub-Signature'] || '').match(/^sha1=([0-9a-f]{40})$/) || [])[1]
  if (!signature) return clientError('Missing X-Hub-Signature header')

  getWebhookSecret(function(err, secret) {
    if (err) return done(err)
    if (!secret) return clientError('Missing secretEnv.GITHUB_SECRET in global config')

    var signedBody = crypto.createHmac('sha1', secret).update(event.body || '').digest('hex')
    if (signature !== signedBody) return clientError('X-Hub-Signature does not match signed body')

    if (eventType == 'ping') {
      log.info('Ping event, not running build')
      return done(null, {msg: 'pong'})
    }

    var buildData

    try {
      buildData = exports.parseEvent(event, eventType)
    } catch (e) {
      return clientError(e.message)
    }

    if (buildData.ignore) {
      log.info(buildData.ignore)
      log.info('Not running build')
      return done(null, {msg: buildData.ignore})
    }

    if (eventType == 'status') {
      lambda.invoke({
        InvocationType: 'Event',
        FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
        Payload: JSON.stringify(Object.assign({action: 'updateStatus'}, buildData)),
      }, done)
    } else {
      lambda.invoke({
        InvocationType: 'Event',
        FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
        Payload: JSON.stringify(Object.assign({action: 'build'}, buildData)),
      }, done)
    }
  })
}

exports.parseEvent = function(event, eventType) {
  var innerEvent

  try {
    innerEvent = JSON.parse(event.body)
  } catch (e) {
    throw new Error(`Could not parse webhook body as JSON: ${e.message}`)
  }

  return github.parseEvent(innerEvent, eventType)
}

function getWebhookSecret(cb) {
  if (Date.now() < WEBHOOK_CONFIG.fetchedAt + WEBHOOK_CONFIG_TTL) {
    log.info('Using cached webhook secret')
    return cb(null, WEBHOOK_CONFIG.secret)
  }
  db.getGlobalConfigValue('secretEnv.GITHUB_SECRET', function(err, config) {
    if (err) return cb(err)
    WEBHOOK_CONFIG.secret = config && config.secretEnv && config.secretEnv.GITHUB_SECRET
    if (WEBHOOK_CONFIG.secret) {
      WEBHOOK_CONFIG.fetchedAt = Date.now()
    }
    cb(null, WEBHOOK_CONFIG.secret)
  })
}
