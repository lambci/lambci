var dockerLambda = require('docker-lambda')
var AWS = require('aws-sdk')
var iam = new AWS.IAM()
var sts = new AWS.STS()

// var lambdaEvent = require('../../docker/push.private.json')
// var lambdaEvent = require('../../docker/pullRequest.private.json')
// var lambdaEvent = require('./fixtures/pullRequest.failure.json')
var lambdaEvent = require('./fixtures/pullRequest.synchronize.json')

if (require.main == module) {
  assumeRole(runBuild)
}

function runBuild() {
  dockerLambda({
    event: lambdaEvent,
    addEnvVars: true,
    dockerArgs: ['-e', `AWS_LAMBDA_FUNCTION_NAME=${process.env.STACK || 'lambci'}-build`],
    spawnOptions: {encoding: 'utf8', stdio: 'inherit'},
  })
}

// This test will work without assuming the lambda execution role –
// but to really test that the function has the correct permissions,
// you can add the "AWS" entry as the Principal in the Role.
// You can do this manually, or by updating lambci.template, as below:
/*
"LambdaExecution": {
  "Type": "AWS::IAM::Role",
  "Properties": {
    "AssumeRolePolicyDocument": {
      "Statement": {
        "Effect": "Allow",
        "Principal": {
          "Service": "lambda.amazonaws.com",
          "AWS": {"Fn::Join": ["", ["arn:aws:iam::", {"Ref": "AWS::AccountId"}, ":root"]]}
        },
        "Action": "sts:AssumeRole"
      }
    },
    ...
*/

// Tries to assume the lambci-LambdaExecution-* role – but doesn't matter if can't
function assumeRole(cb) {
  iam.listRoles(function(err, data) {
    if (err || !data) return cb() // ignore errors, just can't assume the role
    var role = data.Roles.find(role => /^lambci-LambdaExecution/.test(role.RoleName))
    if (!role) return cb()
    sts.assumeRole({RoleArn: role.Arn, RoleSessionName: 'lambci'}, function(err, data) {
      if (err || !data) return cb() // ignore errors, just can't assume the role
      process.env.AWS_ACCESS_KEY_ID = data.Credentials.AccessKeyId
      process.env.AWS_SECRET_ACCESS_KEY = data.Credentials.SecretAccessKey
      process.env.AWS_SESSION_TOKEN = data.Credentials.SessionToken
      cb()
    })
  })
}
