var async = require('neo-async')
var config = require('../utils/config')
var db = require('../db')
var BuildInfo = require('./buildInfo.js')
var log = require('../utils/log')

module.exports = updateStatus

// For ecs builds the lambda build function exists before the build is finished.
// The slack message and the github status update are done from inside the ecs container.
// This results in unfinished builds in dynamodb and s3 objects such as badges
// won't get updated.
// To fix this we subscribe to the status-event in github to get notified when
// the build has finished.
function updateStatus(buildData, context, cb) {
  // get the lambci config and build info from dynamodb
  async.parallel({
    configs: (cb) => db.getConfigs(['global', buildData.project], cb),
    buildInfo: (cb) => db.getBuild(buildData.project, buildData.buildNum, cb),
  }, function(err, data) {
    if (err) return cb(err)

    // only try to fix builds that are still stuck in pending state
    if (data.buildInfo.status != "pending") return cb()

    data.buildInfo.isRebuild = false
    data.buildInfo.committers = [data.buildInfo.user]

    var build = new BuildInfo(data.buildInfo, context)
    build.startedAt = new Date(Date.parse(data.buildInfo.startedAt))

    build.config = config.initConfig(data.configs, build)
    build.token = build.config.secretEnv.GITHUB_TOKEN

    if (buildData.status == 'success') {
      build.status = 'success'
      log.info(`Build #${build.buildNum} successful!`)
    } else if (buildData.status == 'failure') {
      build.status = 'failure'
      log.info(`Build #${build.buildNum} failed`)
    } else {
      return cb(new Error('unknown build status'))
    }

    // wait 10s to ensure that the build lambda has had enough time to upload
    // the log to s3
    setTimeout(function() {
      // init logger so that the finish tasks that update s3 objects
      // (such as badges and log output) get registered.
      build.logUrl = log.initBuildLog(build)

      // add db to finish tasks so that the build gets marked as done in dynamodb
      var finishTasks = build.statusEmitter.finishTasks.concat(db.finishBuild)

      // end build
      build.endedAt = new Date()
      build.statusEmitter.emit('finish', build)

      async.forEach(finishTasks, (task, cb) => task(build, cb), function(taskErr) {
        log.logIfErr(taskErr)
        cb(build.error)
      })
    }, 10000);
  });
}
