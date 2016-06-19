var fs = require('fs')
var crypto = require('crypto')
var execSync = require('child_process').execSync
var async = require('async')
var AWS = require('aws-sdk')
var ansiUp = require('ansi_up')
var buildTemplate = require('../html/build.html.js')

var s3 = new AWS.S3()

var SVGS = {
  pending: fs.readFileSync(`${__dirname}/../html/pending.svg`, 'utf8'),
  passing: fs.readFileSync(`${__dirname}/../html/passing.svg`, 'utf8'),
  failing: fs.readFileSync(`${__dirname}/../html/failing.svg`, 'utf8'),
}

exports.logIfErr = function(err) {
  if (err) exports.error(err.stack || err)
}

exports.info = function() {
  console.log.apply(console, arguments)
}

exports.error = function() {
  console.error.apply(console, arguments)
}

exports.raw = function(msg) {
  if (typeof msg == 'object' && !Buffer.isBuffer(msg)) {
    msg = JSON.stringify(msg) + '\n'
  }
  process.stdout.write(msg)
}

exports.getBuildStream = function(build) {
  build.logFile = build.logFile || '/tmp/log.txt'
  return fs.createWriteStream(build.logFile, {flags: 'a'})
}

exports.getTail = function(build) {
  try {
    return execSync(`tail -20 ${build.logFile}`, {encoding: 'utf8'})
  } catch (e) {
    return ''
  }
}

// From https://github.com/chalk/ansi-regex
var ANSI_REGEX = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g

exports.stripAnsi = function(txt) {
  return txt.replace(ANSI_REGEX, '')
}

exports.initBuildLog = function(config, build) {

  build.lambdaLogUrl = exports.lambdaLogUrl(build)

  if (!config.s3Bucket) {
    return build.lambdaLogUrl
  }

  build.buildDirUrl = exports.buildDirUrl(build, config.s3Bucket)
  build.logFile = build.logFile || '/tmp/log.txt'

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

  build.statusEmitter.on('finish', () => {
    finished = true
    clearTimeout(s3timeout)
    uploadS3Log(build, bucket, buildKey, branchKey, branchStatusKey, makeS3Public, exports.logIfErr)
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

function uploadS3Log(build, bucket, key, branchKey, branchStatusKey, makePublic, cb) {
  fs.readFile(build.logFile, 'utf8', function(err, logTxt) {
    if (err && err.code != 'ENOENT') return cb(err)

    var params = {
      build: build,
      log: ansiUp.linkify(ansiUp.ansi_to_html(ansiUp.escape_for_html(logTxt || ''))),
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
        Body: svgBody,
        ACL: makePublic ? 'public-read' : undefined,
      }, cb)
    },
  ], cb)
}

