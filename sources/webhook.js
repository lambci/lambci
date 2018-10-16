var AWS = require('aws-sdk')
var utils = require('../utils')
var log = require('../utils/log')
var github = require('./github')

var lambda = new AWS.Lambda()

exports.build = function(event, context, cb) {
  var done = utils.once(function webhookDone(err, data) {
    log.logIfErr(err)
    cb(err, {
      statusCode: 200,
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(data || {}),
    })
  })

  var eventType = event.headers && event.headers['X-GitHub-Event']

  if (eventType == 'ping') {
    log.info('Ping event, not running build')
    return done(null, {msg: 'pong'})
  }

  exports.parseEvent(event, eventType, function(err, buildData) {
    if (err) return done(err)

    if (buildData.ignore) {
      log.info(buildData.ignore)
      log.info('Not running build')
      return done(null, {msg: buildData.ignore})
    }

    lambda.invoke({
      InvocationType: 'Event',
      FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
      Payload: JSON.stringify(Object.assign({action: 'build'}, buildData)),
    }, done)
  })
}

// Currently only GitHub is supported as a source
// eventType will be 'push' or 'pull_request'
exports.parseEvent = function(event, eventType, cb) {
  var innerEvent

  try {
    innerEvent = JSON.parse(event.body)
  } catch (e) {
    return cb(new Error(`Could not parse webhook body as JSON: ${e.message}`))
  }

  var buildData
  try {
    buildData = github.parseEvent(innerEvent, eventType)
  } catch (e) {
    return cb(e)
  }
  cb(null, buildData)
}
