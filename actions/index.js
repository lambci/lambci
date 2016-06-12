var config = require('../utils/config')
var build = require('./build')

// NOTE: All function exports from this module can be executed by Lambda

exports.version = function(event, context, cb) {
  return cb(null, config.VERSION)
}

exports.rebuild = function(event, context, cb) {
  if (!event.repo || !event.buildNum) {
    return cb(new Error('Rebuild action missing repo or buildNum'))
  }
  // TODO: finish this
}

exports.build = build
