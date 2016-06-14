var fs = require('fs')
var execSync = require('child_process').execSync
var AWS = require('aws-sdk')
var ansiUp = require('ansi_up')

var s3 = new AWS.S3()

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

exports.initBuildLog = function(config, build) {

  if (!config.s3Bucket) {
    return getLogUrl(config.env.LOG_URL_TEMPLATE, build)
  }

  build.logFile = build.logFile || '/tmp/log.txt'
  var bucket = config.s3Bucket
  var key = `${build.project}/${build.buildNum}.html`
  var s3timeout, finished = false
  var s3uploader = () => {
    uploadS3Log(build.logFile, bucket, key, (err) => {
      exports.logIfErr(err)
      if (!finished) {
        s3timeout = setTimeout(s3uploader, 5000)
      }
    })
  }
  build.statusEmitter.on('finish', () => {
    finished = true
    clearTimeout(s3timeout)
    uploadS3Log(build.logFile, bucket, key, exports.logIfErr)
  })
  s3uploader()

  return s3.getSignedUrl('getObject', {
    Bucket: bucket,
    Key: key,
    Expires: 365 * 24 * 60 * 60, // Default expiry 1yr
  })
}

function uploadS3Log(file, bucket, key, cb) {
  fs.readFile(file, 'utf8', function(err, logTxt) {
    if (err && err.code != 'ENOENT') return cb(err)

    var params = {
      Bucket: bucket,
      Key: key,
      ContentType: 'text/html; charset=utf-8',
      Body: '<body style="background-color: black; color: white; padding: 5px"><pre>' +
        ansiUp.linkify(ansiUp.ansi_to_html(ansiUp.escape_for_html(logTxt || ''))),
    }

    s3.upload(params, cb)
  })
}

function getLogUrl(template, build) {
  template = template || 'https://console.aws.amazon.com/cloudwatch/home?region={{region}}#logEvent:' +
    'group={{group}};stream={{stream}};start={{startISONoMs}}'

  var params = {
    group: build.logGroupName,
    stream: build.logStreamName,
    requestId: build.requestId,
    region: process.env.AWS_REGION,
    start: build.startedAt,
    startISO: build.startedAt.toISOString(),
    startISONoMs: build.startedAt.toISOString().slice(0, 19) + 'Z',
  }
  return Object.keys(params).reduce(function(str, key) {
    return str.replace(new RegExp(`{{${key}}}`, 'g'), encodeURIComponent(params[key]))
  }, template)
}

