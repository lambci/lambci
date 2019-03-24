var path = require('path')
var config = require('../utils/config')
var EventEmitter = require('events')

module.exports = BuildInfo

function BuildInfo(buildData, context) {
  this.startedAt = new Date()
  this.endedAt = null

  this.status = 'pending'
  this.statusEmitter = new EventEmitter()

  // Any async functions to run on 'finish' should be added to this array,
  // and be of the form: function(build, cb)
  this.statusEmitter.finishTasks = []

  this.project = buildData.project
  this.buildNum = buildData.buildNum || 0

  this.repo = buildData.repo || this.project.replace(/^gh\//, '')

  if (buildData.trigger) {
    var triggerPieces = buildData.trigger.split('/')
    this.trigger = buildData.trigger
    this.eventType = triggerPieces[0] == 'pr' ? 'pull_request' : 'push'
    this.prNum = triggerPieces[0] == 'pr' ? +triggerPieces[1] : 0
    this.branch = triggerPieces[0] == 'push' ? triggerPieces[1] : (buildData.branch || 'master')
  } else {
    this.eventType = buildData.eventType
    this.prNum = buildData.prNum
    this.branch = buildData.branch
    this.trigger = this.prNum ? `pr/${this.prNum}` : `push/${this.branch}`
  }

  this.event = buildData.event
  this.isPrivate = buildData.isPrivate
  this.isRebuild = buildData.isRebuild

  this.branch = buildData.branch
  this.cloneRepo = buildData.cloneRepo || this.repo
  this.checkoutBranch = buildData.checkoutBranch || this.branch
  this.commit = buildData.commit
  this.baseCommit = buildData.baseCommit
  this.comment = buildData.comment
  this.user = buildData.user

  this.isFork = this.cloneRepo != this.repo

  this.committers = buildData.committers

  this.config = null
  this.cloneDir = path.join(config.BASE_BUILD_DIR, this.repo)

  this.requestId = context.awsRequestId
  this.logGroupName = context.logGroupName
  this.logStreamName = context.logStreamName

  this.token = ''
  this.logUrl = ''
  this.lambdaLogUrl = ''
  this.buildDirUrl = ''
  this.error = null
}
