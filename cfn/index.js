var async = require('neo-async')
var AWS = require('aws-sdk')
var utils = require('../utils')
var log = require('../utils/log')
var db = require('../db')
var github = require('../sources/github')

exports.update = function(event, context, cb) {

  log.info(`CloudFormation request type: ${event.RequestType}`)

  // We want to try and respond to event.ResponseURL no matter what

  var done = utils.once(function(err, msg) {
    process.removeListener('uncaughtException', done)
    if (err) {
      log.error('%s\n%j', err.stack || err, err)
    } else if (msg) {
      log.info(msg)
    }
    notifyCfn(err, msg, event, context.logStreamName, cb)
  })

  process.removeAllListeners('uncaughtException')
  process.on('uncaughtException', done)

  performUpdates(event, done)
}

// Example event from CloudFormation:
/*
{
  "RequestType": "Update",
  "ServiceToken": "arn:aws:lambda:us-east-1:1234:function:lambci-build",
  "ResponseURL": "https://cloudformation-custom-resource-response-useast1.s3.amazonaws.com/arnxyz?AWSAccessKeyId=AKID",
  "StackId": "arn:aws:cloudformation:us-east-1:1234:stack/lambci/1234-4567-8901-1234-5678",
  "RequestId": "1234-4567-8901-1234-5678",
  "LogicalResourceId": "ConfigUpdater",
  "PhysicalResourceId": "2016/01/01/[$LATEST]abcd12345",
  "ResourceType": "Custom::ConfigUpdater",
  "ResourceProperties": {
    "ServiceToken": "arn:aws:lambda:us-east-1:1234:function:lambci-build",
    "Repositories": [
      "lambci/lambci",
      "lambci/docker-lambda"
    ],
    "SlackChannel": "#test",
    "S3Bucket": "lambci-buildresults-1234ABCD",
    "SnsSecret": "Acs/8nS",
    "GithubToken": "1234ebcd",
    "SnsTopic": "arn:aws:sns:us-east-1:1234:lambci-InvokeTopic-1234ABCD",
    "SlackToken": "xoxb-12345-abcd234",
    "SnsAccessKey": "AKIAXYZ"
  },
  "OldResourceProperties": {
    "ServiceToken": "arn:aws:lambda:us-east-1:1234:function:lambci-build",
    "Repositories": [
      "lambci/lambci"
    ],
    "SlackChannel": "#test",
    "S3Bucket": "lambci-buildresults-1234ABCD",
    "SnsSecret": "Acs/8nS",
    "GithubToken": "1234ebcd",
    "SnsTopic": "arn:aws:sns:us-east-1:1234:lambci-InvokeTopic-1234ABCD",
    "SlackToken": "xoxb-12345-abcd234",
    "SnsAccessKey": "AKIAXYZ"
  }
}
*/
// See here for more details:
// https://github.com/aws/aws-cfn-resource-bridge/blob/master/aws/cfn/bridge/resources.py

function performUpdates(event, cb) {
  if (!~['Create', 'Update'].indexOf(event.RequestType)) {
    // Is probably a Delete event
    return cb(null, `Not performing any stack updates on event: ${event.RequestType}`)
  }

  var props = event.ResourceProperties, oldProps = event.OldResourceProperties || {}
  var configUpdates = [], githubTokenUpdated = false

  if (props.S3Bucket && props.S3Bucket != oldProps.S3Bucket) {
    configUpdates.push({s3Bucket: props.S3Bucket})
  }
  if (props.GithubToken && props.GithubToken != oldProps.GithubToken) {
    githubTokenUpdated = true
    configUpdates.push({secretEnv: {GITHUB_TOKEN: props.GithubToken}})
  }
  if (props.SlackToken && props.SlackToken != oldProps.SlackToken) {
    configUpdates.push({secretEnv: {SLACK_TOKEN: props.SlackToken}})
  }
  if (props.SlackChannel && props.SlackChannel != oldProps.SlackChannel) {
    configUpdates.push({notifications: {slack: {channel: props.SlackChannel}}})
  }

  var repos = (props.Repositories || []).map(repo => repo.trim()).filter(Boolean)
  var oldRepos = (oldProps.Repositories || []).map(repo => repo.trim()).filter(Boolean)
  var addedRepos = repos.filter(repo => !~oldRepos.indexOf(repo))
  var deletedRepos = oldRepos.filter(repo => !~repos.indexOf(repo))

  var reposUpdated = repos.length && (addedRepos.length || deletedRepos.length)

  var snsUpdated = ['SnsTopic', 'SnsAccessKey', 'SnsSecret', 'SnsFailuresRole']
    .some(prop => props[prop] && props[prop] != oldProps[prop])

  if (!configUpdates.length && !reposUpdated && !snsUpdated) {
    return cb(null, 'No stack properties need updates')
  }

  var updates = []

  if (configUpdates.length) {
    updates.push(cb => db.updateGlobalConfig(utils.merge.apply(null, configUpdates), cb))
  }

  var updatedRepos = (githubTokenUpdated || snsUpdated) ? repos : addedRepos

  updates.push(function updateRepos(cb) {
    async.forEach(updatedRepos, function updateRepoHook(repo, cb) {
      var githubClient = github.createClient({token: props.GithubToken, repo: repo})
      githubClient.createOrUpdateSnsHook(props.SnsAccessKey, props.SnsSecret, props.SnsTopic, function(err) {
        if (err) {
          log.error('Error updating SNS Hook for %s: %s\n%j', repo, err.message || err, err)
          log.error('You can update it at https://github.com/%s/settings/hooks', repo)
        }
        cb() // Don't fail on errors updating hooks – can update manually
      })
    }, cb)
  })

  updates.push(function deleteRepos(cb) {
    async.forEach(deletedRepos, function deleteRepoHook(repo, cb) {
      var githubClient = github.createClient({token: props.GithubToken, repo: repo})
      githubClient.deleteSnsHook(null, function(err) {
        if (err) {
          log.error('Error deleting SNS Hook for %s: %s\n%j', repo, err.message || err, err)
          log.error('You can delete it at https://github.com/%s/settings/hooks', repo)
        }
        cb() // Don't fail on errors deleting hooks – can remove manually
      })
    }, cb)
  })

  if (snsUpdated) {
    updates.push(function updateSnsFailureRole(cb) {
      log.info('Updating SNS topic to log failures')
      new AWS.SNS().setTopicAttributes({
        TopicArn: props.SnsTopic,
        AttributeName: 'LambdaFailureFeedbackRoleArn',
        AttributeValue: props.SnsFailuresRole,
      }, cb)
    })
  }

  async.parallel(updates, err => cb(err))
}

function notifyCfn(err, msg, event, resourceId, cb) {
  var options = {
    url: event.ResponseURL,
    method: 'PUT',
    headers: {
      'Content-Type': '',
    },
    body: {
      Status: err ? 'FAILED' : 'SUCCESS',
      Reason: err ? err.message : msg,
      PhysicalResourceId: resourceId,
      StackId: event.StackId,
      RequestId: event.RequestId,
      LogicalResourceId: event.LogicalResourceId,
    },
  }
  utils.request(options, err => cb(err))
}

