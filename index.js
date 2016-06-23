var utils = require('./utils')
var config = require('./utils/config')
var log = require('./utils/log')
var cfn = require('./cfn')
var actions = require('./actions')
var sns = require('./sources/sns')

config.initSync()

exports.handler = function(event, context, cb) {

  log.init(`LambCI v${config.VERSION} triggered on stack "${config.STACK}"\n`) // STACK is usually 'lambci'

  // Check if it's the CloudFormation stack calling us
  if (event.ResourceType == 'Custom::ConfigUpdater') {

    return cfn.update(event, context, cb)

  // Or a custom (manual) event
  } else if (typeof actions[event.action] == 'function') {

    return actions[event.action](event, context, cb)

  // Otherwise it should be SNS
  } else if (event.Records && event.Records[0] && event.Records[0].Sns) {

    return snsBuild(event.Records[0].Sns, context, cb)
  }

  log.error('Unknown event, ignoring:\n%j', event)
  return cb(new Error('Unknown event'))
}

function snsBuild(snsEvent, context, cb) {

  // Lambda/SNS currently has no setting to determine whether errors should be retried
  // By default they are, which we don't want, so always try to callback successfully
  var done = utils.once(function snsDone(err, data) {
    log.logIfErr(err)
    cb(null, data)
  })

  var build
  try {
    build = sns.parseEvent(snsEvent)
  } catch (e) {
    return done(e)
  }

  if (build.ignore) {
    log.info(build.ignore)
    log.info('Not running build')
    return done()
  }

  actions.build(build, context, done)
}

