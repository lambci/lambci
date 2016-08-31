var AWS = require('aws-sdk')
var log = require('../utils/log')

var sns = new AWS.SNS()

exports.createClient = function(options, build) {
  return new SnsClient(options, build)
}

exports.SnsClient = SnsClient

// You can update the CloudFormation stack to include an SNS topic,
// so you can then subscribe to, for example, email notifications

// It could be as simple as adding a resource like this:
/*
"StatusTopic" : {
  "Type": "AWS::SNS::Topic",
  "Properties": {
    "DisplayName": "LambCI"
  }
}
*/
// The LambCI build function will need permissions to Publish to this topic too.
// Eg, updating the LambdaExecution role to include:
/*
{
  "PolicyName": "PublishSNS",
  "PolicyDocument": {
    "Statement": {
      "Effect": "Allow",
      "Action": [
        "sns:Publish"
      ],
      "Resource": {"Ref": "StatusTopic"}
    }
  }
}
*/
// Then you'll need to enable these notifications in your LambCI config using the topic ARN:
/*
notifications: {
  sns: {
    topicArn: 'arn:aws:sns:us-east-1:1234:lambci-StatusTopic-1WF8BT36',
  },
}
*/

function SnsClient(options, build) {
  this.topicArn = options.topicArn

  this.repo = build.repo
  this.branch = build.branch
  this.prNum = build.prNum
  this.commit = build.commit
  this.logUrl = build.logUrl

  build.statusEmitter.finishTasks.push((build, cb) => {
    var subject = `LambCI Build #${build.buildNum} successful!`
    var message = `LambCI Build #${build.buildNum}
Repo: ${this.repo}
${this.prNum ? `Pull Request: ${this.prNum}` : `Branch: ${this.branch}`}
Commit: ${this.commit}
Log: ${this.logUrl}
`
    if (build.error) {
      message += `Error: ${build.error.message}`
      if (build.error.logTail) {
        message += `\n${build.error.logTail}`
      }
      subject = `LambCI Build #${build.buildNum} failed`
    }
    sns.publish({
      TopicArn: this.topicArn,
      Subject: subject,
      Message: message,
      MessageAttributes: {
        status: {
          DataType: 'String',
          StringValue: build.error ? 'failure' : 'success',
        },
      },
    }, function(err) {
      log.logIfErr(err)
      cb()
    })
  })
}

