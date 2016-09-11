var util = require('util')
var fs = require('fs')
var crypto = require('crypto')
var async = require('async')
var AWS = require('aws-sdk')
var ansiUp = require('ansi_up')
var buildTemplate = require('../html/build.html.js')

// We buffer all logs in-memory, including cmd output
// TODO: make this buffer to file to ensure we don't run out of mem
var LOG_BUFFER = []

var SVGS = {
  pending: fs.readFileSync(`${__dirname}/../html/pending.svg`, 'utf8'),
  passing: fs.readFileSync(`${__dirname}/../html/passing.svg`, 'utf8'),
  failing: fs.readFileSync(`${__dirname}/../html/failing.svg`, 'utf8'),
}

var s3 = new AWS.S3()

exports.logIfErr = function(err) {
  if (err) exports.error(err.stack || err)
}

// We rely on a singleton logger (for the buffer), so this is kinda hacky
// (ie, cannot execute concurrent invocations from the same process)
// We could return a new logger instance, but... meh.
// Lambda doesn't execute concurrently in the same process anyway.
exports.init = function() {
  LOG_BUFFER = []
  exports.info.apply(exports, arguments)
}

exports.info = function() {
  LOG_BUFFER.push(util.format.apply(util, arguments))
  console.log.apply(console, arguments) // eslint-disable-line no-console
}

exports.error = function() {
  LOG_BUFFER.push(util.format.apply(util, arguments))
  console.error.apply(console, arguments) // eslint-disable-line no-console
}

exports.raw = function(msg) {
  if (typeof msg == 'object' && !Buffer.isBuffer(msg)) {
    msg = JSON.stringify(msg) + '\n'
  }
  process.stdout.write(msg)
}

exports.getTail = function() {
  var lastLines = LOG_BUFFER.slice(-20)
  if (lastLines.length < LOG_BUFFER.length) {
    lastLines.unshift('...')
  }
  return exports.stripAnsi(lastLines.join('\n'))
}

// From https://github.com/chalk/ansi-regex
var ANSI_REGEX = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g

exports.stripAnsi = function(txt) {
  return txt.replace(ANSI_REGEX, '')
}

exports.initBuildLog = function(build) {
  var config = build.config

  build.lambdaLogUrl = exports.lambdaLogUrl(build)

  if (!config.s3Bucket) {
    return build.lambdaLogUrl
  }

  build.buildDirUrl = exports.buildDirUrl(build, config.s3Bucket)

  var filename = 'index'
  var buildDir = `${build.project}/builds/${build.buildNum}`

  var branchFilename = 'index'
  var branchStatusFilename = 'status'
  var branchDir = `${build.project}/branches/${build.branch}`

  var makeS3Public = !build.isPrivate

  if (config.s3PublicSecretNames) {
    filename = crypto.randomBytes(16).toString('hex')
    if (build.eventType == 'push') {
      branchFilename = crypto.createHash('md5').update(`${build.token}/${branchDir}/html`).digest('hex')
      branchStatusFilename = crypto.createHash('md5').update(`${build.token}/${branchDir}/svg`).digest('hex')
    }
    makeS3Public = true
  }

  var buildKey = `${buildDir}/${filename}.html`
  var branchKey = `${branchDir}/${branchFilename}.html`
  var branchStatusKey = `${branchDir}/${branchStatusFilename}.svg`

  var bucket = config.s3Bucket
  var s3timeout, finished = false
  var s3uploader = () => {
    uploadS3Log(build, bucket, buildKey, branchKey, branchStatusKey, makeS3Public, (err) => {
      exports.logIfErr(err)
      if (!finished) {
        s3timeout = setTimeout(s3uploader, 5000)
      }
    })
  }

  build.statusEmitter.finishTasks.push((build, cb) => {
    finished = true
    clearTimeout(s3timeout)
    uploadS3Log(build, bucket, buildKey, branchKey, branchStatusKey, makeS3Public, function(err) {
      exports.logIfErr(err)
      cb()
    })
  })

  if (build.eventType == 'push') {
    exports.info(`Branch log: https://${bucket}.s3.amazonaws.com/${branchKey}`)
    exports.info(`Branch status img: https://${bucket}.s3.amazonaws.com/${branchStatusKey}`)
  }

  s3uploader()

  return makeS3Public ? `https://${bucket}.s3.amazonaws.com/${buildKey}` : `${build.buildDirUrl}/${build.buildNum}`
}

exports.lambdaLogUrl = function(build) {
  return `https://console.aws.amazon.com/cloudwatch/home?region=${process.env.AWS_REGION}#logEvent:` +
    `group=${encodeURIComponent(build.logGroupName)};` +
    `stream=${encodeURIComponent(build.logStreamName)};` +
    `start=${encodeURIComponent(build.startedAt.toISOString().slice(0, 19))}Z`
}

exports.buildDirUrl = function(build, bucket) {
  return `https://console.aws.amazon.com/s3/home?region=${process.env.AWS_REGION}#` +
    `&bucket=${bucket}&prefix=${build.project}/builds`
}

var ESCAPE_REGEX = /[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g
function uploadS3Log(build, bucket, key, branchKey, branchStatusKey, makePublic, cb) {
  var secretValues = Object.keys(build.config.secretEnv)
    .filter(function(key) {
      return build.config.secretEnv[key].length !== 0 &&
        build.config.logFilter.whiteList.indexOf(key) === -1
    })
    .map(function(key) {
      return build.config.secretEnv[key].replace(ESCAPE_REGEX, "\\$&")
    })
  var log = LOG_BUFFER.join('\n')
  if (secretValues.length !== 0) {
    var secretRegex = new RegExp(secretValues.join("|"), "g")
    log = log.replace(secretRegex, '[filtered]')
  }

  var params = {
    build: build,
    log: ansiUp.linkify(ansiUp.ansi_to_html(ansiUp.escape_for_html(log))),
  }

  s3.upload({
    Bucket: bucket,
    Key: key,
    ContentType: 'text/html; charset=utf-8',
    Body: buildTemplate(params),
    ACL: makePublic ? 'public-read' : undefined,
  }, function(err) {
    if (err) return cb(err)
    updateS3Branch(build, bucket, key, branchKey, branchStatusKey, makePublic, cb)
  })
}

function updateS3Branch(build, bucket, key, branchKey, branchStatusKey, makePublic, cb) {
  if (build.eventType != 'push') return cb()

  var svgKey = {
    pending: 'pending',
    success: 'passing',
    failure: 'failing',
  }
  var svgBody = SVGS[svgKey[build.status]] || SVGS.pending

  async.parallel([
    function copyBuildLogToBranch(cb) {
      s3.copyObject({
        Bucket: bucket,
        CopySource: `${bucket}/${key}`,
        Key: branchKey,
        ContentType: 'text/html; charset=utf-8',
        ACL: makePublic ? 'public-read' : undefined,
      }, cb)
    },
    function uploadSvgStatus(cb) {
      s3.upload({
        Bucket: bucket,
        Key: branchStatusKey,
        ContentType: 'image/svg+xml; charset=utf-8',
        CacheControl: 'no-cache',
        Body: svgBody,
        ACL: makePublic ? 'public-read' : undefined,
      }, cb)
    },
  ], cb)
}

