var config = require('./utils/config')
var log = require('./utils/log')
var cfn = require('./cfn')
var actions = require('./actions')
var webhook = require('./sources/webhook')

exports.handler = function(event, context, cb) {

  log.init(`LambCI v${config.VERSION} triggered on stack "${config.STACK}"\n`) // STACK is usually 'lambci'

  // Check if it's the CloudFormation stack calling us
  if (event.ResourceType == 'Custom::ConfigUpdater') {

    return cfn.update(event, context, cb)

  // Or a custom (manual) event
  } else if (typeof actions[event.action] == 'function') {

    return actions[event.action](event, context, cb)

  // Otherwise it should be a GitHub webhook
  } else if (event.httpMethod == 'POST') {

    return webhook.build(event, context, cb)
  }

  log.error('Unknown event, ignoring:\n%j', event)
  return cb(new Error('Unknown event'))
}

