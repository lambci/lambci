var https = require('https')
var AWS = require('aws-sdk')
var utils = require('../utils')
var config = require('../utils/config')
var log = require('../utils/log')

var CONFIG_TABLE = config.STACK + '-config'
var BUILDS_TABLE = config.STACK + '-builds'

// https://github.com/aws/aws-sdk-js/issues/862
var client = new AWS.DynamoDB({
  httpOptions: {
    agent: new https.Agent({
      secureProtocol: 'TLSv1_method',
      ciphers: 'ALL',
    }),
  },
})

exports.updateGlobalConfig = function(config, cb) {
  var table = CONFIG_TABLE
  var key = mapToDb({project: 'global'})

  log.info(`Updating global config in ${CONFIG_TABLE}`)

  client.getItem({TableName: table, Key: key}, function(err, curConfig) {
    if (err) return cb(friendlyErr(table, err))
    curConfig = mapFromDb((curConfig && curConfig.Item) || key)
    var newConfig = mapToDb(utils.merge(curConfig, config))
    client.putItem({TableName: table, Item: newConfig}, function(err) {
      if (err) return cb(friendlyErr(table, err))
      cb()
    })
  })
}

exports.getConfigs = function(projects, cb) {
  var table = CONFIG_TABLE
  var req = {RequestItems: {}}
  req.RequestItems[table] = {Keys: projects.map(project => { return {project} }).map(mapToDb)}

  log.info(`Looking up keys in ${CONFIG_TABLE}: ${projects.join(', ')}`)

  client.batchGetItem(req, function(err, data) {
    if (err) return cb(friendlyErr(table, err))
    data = data || {}
    data.Responses = data.Responses || {}
    var configs = (data.Responses[table] || []).map(mapFromDb)
    var orderedConfigs = projects.map(project => configs.find(config => config.project == project))
    cb(null, orderedConfigs)
  })
}

exports.getBuildNum = function(project, cb) {
  var table = BUILDS_TABLE
  client.updateItem({
    TableName: table,
    Key: mapToDb({project, buildNum: 0}),
    UpdateExpression: 'ADD lastBuildNum :one',
    ExpressionAttributeValues: mapToDb({':one': 1}),
    ReturnValues: 'UPDATED_NEW',
  }, function(err, data) {
    if (err) return cb(friendlyErr(table, err))
    cb(null, mapAttrFromDb(data.Attributes.lastBuildNum))
  })
}

exports.initBuild = function(build, cb) {
  var table = BUILDS_TABLE
  exports.getBuildNum(build.project, function(err, buildNum) {
    if (err) return cb(err)
    build.buildNum = buildNum
    var committers = new Set(Object.keys(build.committers || {}).map(key => build.committers[key]))
    client.updateItem({
      TableName: table,
      Key: mapToDb({project: build.project, buildNum}),
      UpdateExpression: 'SET requestId = :requestId, #trigger = :trigger, #commit = :commit, cloneRepo = :cloneRepo, ' +
        'checkoutBranch = :checkoutBranch, startedAt = :startedAt, #status = :status, baseCommit = :baseCommit, ' +
        `#comment = :comment, #user = :user ${committers.size ? ', committers = :committers' : ''}`,
      ExpressionAttributeNames: {
        '#trigger': 'trigger',
        '#commit': 'commit',
        '#status': 'status',
        '#comment': 'comment',
        '#user': 'user',
      },
      ExpressionAttributeValues: mapToDb({
        ':requestId': build.requestId,
        ':trigger': build.trigger,
        ':commit': build.commit,
        ':cloneRepo': build.cloneRepo,
        ':checkoutBranch': build.checkoutBranch,
        ':startedAt': build.startedAt.toISOString(),
        ':status': build.status,
        ':baseCommit': build.baseCommit,
        ':comment': build.comment,
        ':user': build.user,
        ':committers': committers.size ? committers : undefined,
      }),
    }, function(err) {
      if (err) return cb(friendlyErr(table, err))
      cb(null, build)
    })
  })
}

exports.finishBuild = function(build, cb) {
  var table = BUILDS_TABLE
  client.updateItem({
    TableName: table,
    Key: mapToDb({project: build.project, buildNum: build.buildNum}),
    UpdateExpression: 'SET endedAt = :endedAt, #status = :status',
    ExpressionAttributeNames: {'#status': 'status'},
    ExpressionAttributeValues: mapToDb({
      ':endedAt': build.endedAt.toISOString(),
      ':status': build.status,
    }),
  }, function(err) {
    if (err) return cb(friendlyErr(table, err))
    cb()
  })
}

exports.checkIfRetry = function(build, cb) {
  var table = BUILDS_TABLE
  client.query({
    TableName: table,
    IndexName: 'requestId',
    KeyConditionExpression: '#project = :project AND requestId = :requestId',
    ExpressionAttributeNames: {'#project': 'project'},
    ExpressionAttributeValues: mapToDb({
      ':project': build.project,
      ':requestId': build.requestId,
    }),
  }, function(err, data) {
    if (err) return cb(friendlyErr(table, err))
    cb(null, mapFromDb(data.Items[0]))
  })
}


function friendlyErr(table, err) {
  switch (err.code) {
    case 'UnrecognizedClientException':
      return new Error('Incorrect AWS_ACCESS_KEY_ID or AWS_SESSION_TOKEN')
    case 'InvalidSignatureException':
      return new Error('Incorrect AWS_SECRET_ACCESS_KEY')
    case 'AccessDeniedException':
      return new Error(`Insufficient credentials to access DynamoDB table ${table}`)
    case 'ResourceNotFoundException':
      return new Error(`DynamoDB table ${table} does not exist`)
  }
  return err
}

function mapToDb(jsObj) {
  if (jsObj == null) return {NULL: true}

  var dbItem = {}
  Object.keys(jsObj).forEach(function(key) {
    var dbAttr = mapAttrToDb(jsObj[key], key, jsObj)
    if (dbAttr != null)
      dbItem[key] = dbAttr
  })
  return dbItem
}

function mapFromDb(dbItem) {
  var jsObj = dbItem != null ? {} : null

  if (dbItem != null && jsObj != null) {
    Object.keys(dbItem).forEach(function(key) {
      var jsAttr = mapAttrFromDb(dbItem[key], key, dbItem)
      if (jsAttr !== undefined)
        jsObj[key] = jsAttr
    })
  }
  return jsObj
}

function mapAttrToDb(val) {
  if (val === undefined || val === '') return undefined
  if (val === null) return {NULL: true}
  switch (typeof val) {
    case 'string': return val ? {S: val} : undefined
    case 'boolean': return {BOOL: val}
    case 'number': return {N: numToStr(val)}
    case 'function': return undefined
  }
  if (Array.isArray(val)) return {L: val.map(mapAttrToDb)}
  if (Buffer.isBuffer(val)) {
    if (!val.length) return undefined
    return {B: val.toString('base64')}
  }
  if (val instanceof Set) {
    val = Array.from(val)
    if (!val.length) return undefined
    if (typeof val[0] === 'string') return {SS: val}
    if (typeof val[0] === 'number') return {NS: val.map(numToStr)}
    if (Buffer.isBuffer(val[0])) return {BS: val.map(x => x.toString('base64'))}
  }
  return {M: mapToDb(val)}
}

function mapAttrFromDb(val, key) {
  if (val.S != null) return val.S
  if (val.N != null) return +val.N
  if (val.B != null) return new Buffer(val.B, 'base64')
  if (val.BOOL != null) return Boolean(val.BOOL)
  if (val.NULL != null) return null
  if (val.SS != null || val.NS != null || val.BS != null) {
    var obj = val.SS != null ? val.SS : val.NS != null ? val.NS.map(Number) :
      val.BS.map(x => new Buffer(x, 'base64'))
    return typeof Set == 'function' ? new Set(obj) : obj
  }
  if (val.L != null) return val.L.map(mapFromDb)
  if (val.M != null) return mapFromDb(val.M)
  throw new Error(`Unknown DynamoDB type for "${key}": ${JSON.stringify(val)}`)
}

function numToStr(num) {
  var numStr = String(+num)
  if (numStr === 'NaN' || numStr === 'Infinity' || numStr === '-Infinity')
    throw new Error(`Cannot convert "${num}" to DynamoDB number`)
  return numStr
}

