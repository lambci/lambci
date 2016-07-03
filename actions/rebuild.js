var db = require('../db')
var build = require('./build')

module.exports = rebuild

function rebuild(event, context, cb) {
  if (!event.project || !event.buildNum) {
    return cb(new Error('Rebuild action missing project or buildNum'))
  }
  db.getBuild(event.project, event.buildNum, function(err, buildData) {
    if (err) return cb(err)
    if (!buildData) return cb(new Error(`No build #${event.buildNum} found for project ${event.project}`))
    build(buildData, context, cb)
  })
}
