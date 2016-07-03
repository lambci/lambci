var config = require('../utils/config')
var db = require('../db')
var runBuild = require('./build')

// NOTE: All function exports from this module can be executed by Lambda

exports.build = runBuild

exports.version = function(event, context, cb) {
  return cb(null, config.VERSION)
}

exports.rebuild = function(event, context, cb) {
  if (!event.repo || !event.buildNum) {
    return cb(new Error('Rebuild action missing repo or buildNum'))
  }
  db.getBuild(`gh/${event.repo}`, event.buildNum, function(err, build) {
    if (err) return cb(err)
    if (!build) return cb(new Error(`No build #${event.buildNum} found for repo ${event.repo}`))
    var triggerPieces = build.trigger.split('/')
    build.repo = event.repo
    build.eventType = triggerPieces[0] == 'pr' ? 'pull_request' : 'push'
    build.startedAt = new Date()
    build.status = 'pending'
    build.statusEmitter = new (require('events'))()
    build.committers = build.committers.values.reduce((obj, key) => { obj[key] = key; return obj }, Object.create(null))
    build.isFork = build.cloneRepo != build.repo
    build.prNum = build.eventType == 'pull_request' ? +triggerPieces[1] : 0

    runBuild(build, context, cb)
  })
}

