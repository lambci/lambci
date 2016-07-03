var github = require('./github')
var db = require('../db')

exports.parseEvent = function(snsEvent, cb) {
  var innerEvent

  try {
    innerEvent = JSON.parse(snsEvent.Message)
  } catch (e) {
    return cb(new Error(`Could not parse SNS message string as JSON: ${e.message}`))
  }

  // Currently only GitHub is supported as a source
  // eventType will be 'push' or 'pull_request'
  var eventType = ((snsEvent.MessageAttributes || {})['X-Github-Event'] || {}).Value

  // Check if it's a partial message
  // https://github.com/github/github-services/blob/e779a49a/lib/services/amazon_sns.rb#L44-L55
  if (innerEvent.error && innerEvent.checksum && innerEvent.message) {
    return db.addPartialEvent(innerEvent, function(err, fullEvent) {
      if (err) return cb(err)
      if (!fullEvent) {
        return cb(null, {ignore: 'Only received a partial event'})
      }
      parseGithubEvent(fullEvent, eventType, cb)
    })
  }

  parseGithubEvent(innerEvent, eventType, cb)
}

function parseGithubEvent(event, eventType, cb) {
  var buildData
  try {
    buildData = github.parseEvent(event, eventType)
  } catch (e) {
    return cb(e)
  }
  cb(null, buildData)
}

