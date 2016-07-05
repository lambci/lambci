var https = require('https')
var zlib = require('zlib')
var crypto = require('crypto')
var AWS = require('aws-sdk')
var utils = require('../utils')
var config = require('../utils/config')
var log = require('../utils/log')

var CONFIG_TABLE = `${config.STACK}-config`
var BUILDS_TABLE = `${config.STACK}-builds`

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

exports.getBuild = function(project, buildNum, cb) {
  var table = BUILDS_TABLE
  client.get({
    TableName: table,
    Key: {project, buildNum},
  }, function(err, data) {
    if (err) return cb(friendlyErr(table, err))
    var buildData = (data || {}).Item
    // Convert DynamoDB sets to JS sets
    if (buildData && buildData.committers && buildData.committers.values) {
      buildData.committers = new Set(buildData.committers.values)
    }
    cb(null, buildData)
  })
}

exports.initBuild = function(build, cb) {
  var table = BUILDS_TABLE
  exports.getBuildNum(build.project, function(err, buildNum) {
    if (err) return cb(err)
    build.buildNum = buildNum
    client.put({
      TableName: table,
      Item: {
        project: build.project,
        buildNum,
        requestId: build.requestId,
        trigger: build.trigger,
        isPrivate: build.isPrivate,
        branch: build.branch,
        commit: build.commit,
        cloneRepo: build.cloneRepo,
        checkoutBranch: build.checkoutBranch,
        startedAt: build.startedAt.toISOString(),
        status: build.status,
        baseCommit: build.baseCommit,
        comment: build.comment,
        user: build.user,
        committers: (build.committers || {}).size ? client.createSet(Array.from(build.committers)) : undefined,
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

// GitHub will split up messages that are too large to deliver individually:
// https://github.com/github/github-services/blob/e779a49a/lib/services/amazon_sns.rb#L44-L55
//
// We add these partial messages to the builds table, and once they've all
// arrived, then we reconstruct the original message by patching them back together
exports.addPartialEvent = function(event, cb) {
  var table = BUILDS_TABLE
  var key = {project: `partial/${event.checksum}`, buildNum: 0}
  client.get({
    TableName: table,
    Key: key,
    ConsistentRead: true,
  }, function(err, data) {
    if (err) return cb(friendlyErr(table, err))
    var pagesSoFar = data && data.Item && data.Item.pagesSoFar
    if (pagesSoFar >= event.page_total - 1) {
      return exports.reconstructPartialEvent(event, cb)
    }
    client.put({
      TableName: table,
      Item: {
        project: key.project,
        buildNum: event.page_number,
        message: zlib.gzipSync(event.message),
      },
    }, function(err) {
      if (err) return cb(friendlyErr(table, err))
      client.update({
        TableName: table,
        Key: key,
        UpdateExpression: 'ADD pagesSoFar :one',
        ExpressionAttributeValues: {':one': 1},
        ReturnValues: 'UPDATED_NEW',
      }, function(err, data) {
        if (err) return cb(friendlyErr(table, err))
        var pagesSoFar = data && data.Attributes && data.Attributes.pagesSoFar
        if (pagesSoFar >= event.page_total) {
          return exports.reconstructPartialEvent(event, cb)
        }
        cb()
      })
    })
  })
}

exports.reconstructPartialEvent = function(event, cb) {
  var table = BUILDS_TABLE
  var pagesToGet = []
  for (var i = 1; i <= event.page_total; i++) {
    if (i != event.page_number) pagesToGet.push(i)
  }
  var getRequest = {RequestItems: {}}
  getRequest.RequestItems[table] = {
    ConsistentRead: true,
    Keys: pagesToGet.map(page => { return {project: `partial/${event.checksum}`, buildNum: page} }),
  }
  var deleteRequest = {RequestItems: {}}
  deleteRequest.RequestItems[table] = pagesToGet.concat(0, event.page_number).map(page => {
    return {DeleteRequest: {Key: {project: `partial/${event.checksum}`, buildNum: page}}}
  })

  // TODO: process UnprocessedKeys
  client.batchGet(getRequest, function(err, data) {
    if (err) return cb(friendlyErr(table, err))
    if (!data.Responses[table] || !data.Responses[table].length) {
      return cb(new Error('Count not fetch partial events'))
    }
    var fullEvent, fullMessage = data.Responses[table]
      .map(item => { return {page_number: item.buildNum, message: zlib.gunzipSync(item.message)} })
      .concat(event)
      .sort((a, b) => a.page_number - b.page_number)
      .map(item => item.message)
      .join('')

    var checksum = crypto.createHash('md5').update(fullMessage).digest('hex')
    if (checksum != event.checksum) {
      return cb(new Error(`Reconstructed message checksum ${checksum} doesn't match original ${event.checksum}`))
    }

    try {
      fullEvent = JSON.parse(fullMessage)
    } catch (e) {
      return cb(new Error(`Could not parse reconstructed message as JSON: ${e.message}`))
    }

    // Delete partials out of band – just log if we have an error
    client.batchWrite(deleteRequest, log.logIfErr)

    cb(null, fullEvent)
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

