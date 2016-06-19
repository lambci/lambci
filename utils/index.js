var https = require('https')
var url = require('url')
var querystring = require('querystring')

// Just like normal Node.js https request, but supports `url`, `body` and `timeout` params
exports.request = function(options, cb) {
  cb = exports.once(cb)

  if (options.url) {
    var parsedUrl = url.parse(options.url)
    options.hostname = parsedUrl.hostname
    options.path = parsedUrl.path
    delete options.url
  }

  if (options.body) {
    options.method = options.method || 'POST'
    options.headers = options.headers || {}
    if (typeof options.body != 'string' && !Buffer.isBuffer(options.body)) {
      var contentType = options.headers['Content-Type'] || options.headers['content-type']
      options.body = contentType == 'application/x-www-form-urlencoded' ?
        querystring.stringify(options.body) : JSON.stringify(options.body)
    }
    var contentLength = options.headers['Content-Length'] || options.headers['content-length']
    if (!contentLength) options.headers['Content-Length'] = Buffer.byteLength(options.body)
  }

  var req = https.request(options, function(res) {
    var data = ''
    res.setEncoding('utf8')
    res.on('error', cb)
    res.on('data', function(chunk) { data += chunk })
    res.on('end', function() { cb(null, res, data) })
  }).on('error', cb)

  if (options.timeout != null) {
    req.setTimeout(options.timeout)
    req.on('timeout', function() { req.abort() })
  }

  req.end(options.body)
}

exports.once = function(cb) {
  var called = false
  return function() {
    if (called) return
    called = true
    cb.apply(this, arguments)
  }
}

exports.merge = function(target, source) { // eslint-disable-line no-unused-vars
  for (var i = 1; i < arguments.length; i++) {
    var from = arguments[i]

    Object.keys(Object(from)).forEach(function(key) { // eslint-disable-line no-loop-func
      var needsMerging = target[key] && typeof target[key] == 'object' && !Array.isArray(target[key])
      var needsCloning = from[key] && typeof from[key] == 'object' && !Array.isArray(from[key]) && !needsMerging
      var fromObj = needsCloning ? Object.assign({}, from[key]) : from[key]
      target[key] = needsMerging ? exports.merge(target[key], fromObj) : fromObj
    })
  }
  return target
}

exports.htmlEncode = function(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;') // Included as advised by OWASP
}

//              NUM            . NUM            . NUM            -beta.3.4 (optional)           +build.meta.data (ignore)
var SEMVER = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[\da-z\-]+(?:\.[\da-z\-]+)*)?(?:\+[\da-z\-]+(?:\.[\da-z\-]+)*)?$/i
var SIMPLE_NUMBER = /^(0|[1-9][0-9]*)$/

exports.semverCmp = function(ver1, ver2) {
  if (ver1 === ver2) return 0
  var match1 = ver1.match(SEMVER), match2 = ver2.match(SEMVER)
  if (!match1) return match2 ? 1 : 0
  if (!match2) return -1
  for (var i = 1; i <= 3; i++) {
    var num1 = +match1[i], num2 = +match2[i]
    if (num1 < num2) return -1
    if (num1 > num2) return 1
  }
  if (!match1[4]) return match2[4] ? 1 : 0
  if (!match2[4]) return -1
  var preRels1 = match1[4].slice(1).split('.'), preRels2 = match2[4].slice(1).split('.')
  for (i = 0; i < Math.max(preRels1.length, preRels2.length); i++) {
    var preRel1 = SIMPLE_NUMBER.test(preRels1[i]) ? +preRels1[i] : preRels1[i]
    var preRel2 = SIMPLE_NUMBER.test(preRels2[i]) ? +preRels2[i] : preRels2[i]
    if (i >= preRels1.length || (typeof preRel2 == 'string' && typeof preRel1 == 'number')) return -1
    if (i >= preRels2.length || (typeof preRel1 == 'string' && typeof preRel2 == 'number')) return 1
    if (preRel1 < preRel2) return -1
    if (preRel1 > preRel2) return 1
  }
  return 0
}
