var config = require('../utils/config')

// NOTE: All function exports from this module can be executed by Lambda

exports.version = function(event, context, cb) {
  return cb(null, config.VERSION)
}

exports.build = require('./build')

exports.rebuild = require('./rebuild')

