var https = require('https')
var AWS = require('aws-sdk')
var utils = require('../utils')
var config = require('../utils/config')
var log = require('../utils/log')

var CONFIG_TABLE = config.STACK + '-config'
var BUILDS_TABLE = config.STACK + '-builds'

// https://github.com/aws/aws-sdk-js/issues/862
var rawClient = new AWS.DynamoDB({
  httpOptions: {
    agent: new https.Agent({
      secureProtocol: 'TLSv1_method',
      ciphers: 'ALL',
    }),
  },
})
var client = new AWS.DynamoDB.DocumentClient({service: rawClient})

exports.updateGlobalConfig = function(config, cb) {
  var table = CONFIG_TABLE
  var key = {project: 'global'}

  log.info(`Updating global config in ${CONFIG_TABLE}`)

  client.get({TableName: table, Key: key}, function(err, curConfig) {
    if (err) return cb(friendlyErr(table, err))
    curConfig = (curConfig && curConfig.Item) || key
    var newConfig = utils.merge(curConfig, config)
    client.put({TableName: table, Item: newConfig}, function(err) {
      if (err) return cb(friendlyErr(table, err))
      cb()
    })
  })
}

exports.getConfigs = function(projects, cb) {
  var table = CONFIG_TABLE
  var req = {RequestItems: {}}
  req.RequestItems[table] = {Keys: projects.map(project => { return {project} })}

  log.info(`Looking up keys in ${CONFIG_TABLE}: ${projects.join(', ')}\n`)

  client.batchGet(req, function(err, data) {
    if (err) return cb(friendlyErr(table, err))
    var configs = (data && data.Responses && data.Responses[table]) || []
    var orderedConfigs = projects.map(project => configs.find(config => config.project == project))
    cb(null, orderedConfigs)
  })
}

exports.getBuildNum = function(project, cb) {
  var table = BUILDS_TABLE
  client.update({
    TableName: table,
    Key: {project, buildNum: 0},
    UpdateExpression: 'ADD lastBuildNum :one',
    ExpressionAttributeValues: {':one': 1},
    ReturnValues: 'UPDATED_NEW',
  }, function(err, data) {
    if (err) return cb(friendlyErr(table, err))
    cb(null, data && data.Attributes && data.Attributes.lastBuildNum)
  })
}

exports.initBuild = function(build, cb) {
  var table = BUILDS_TABLE
  exports.getBuildNum(build.project, function(err, buildNum) {
    if (err) return cb(err)
    build.buildNum = buildNum
    var committers = new Set(Object.keys(build.committers || {}).map(key => build.committers[key]))
    client.put({
      TableName: table,
      Item: {
        project: build.project,
        buildNum,
        requestId: build.requestId,
        trigger: build.trigger,
        commit: build.commit,
        cloneRepo: build.cloneRepo,
        checkoutBranch: build.checkoutBranch,
        startedAt: build.startedAt.toISOString(),
        status: build.status,
        baseCommit: build.baseCommit,
        comment: build.comment,
        user: build.user,
        committers: committers.size ? client.createSet(Array.from(committers)) : undefined,
      },
    }, function(err) {
      if (err) return cb(friendlyErr(table, err))
      cb(null, build)
    })
  })
}

exports.finishBuild = function(build, cb) {
  var table = BUILDS_TABLE
  client.update({
    TableName: table,
    Key: {project: build.project, buildNum: build.buildNum},
    UpdateExpression: 'SET endedAt = :endedAt, #status = :status',
    ExpressionAttributeNames: {'#status': 'status'},
    ExpressionAttributeValues: {
      ':endedAt': build.endedAt.toISOString(),
      ':status': build.status,
    },
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
    ExpressionAttributeValues: {
      ':project': build.project,
      ':requestId': build.requestId,
    },
  }, function(err, data) {
    if (err) return cb(friendlyErr(table, err))
    cb(null, data.Items[0])
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

