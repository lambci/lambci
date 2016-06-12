var dockerLambda = require('docker-lambda')

// var lambdaEvent = require('../../docker/push.private.json')
// var lambdaEvent = require('../../docker/pullRequest.private.json')
var lambdaEvent = require('./fixtures/pullRequest.synchronize.json')

function runBuild() {
  dockerLambda({
    event: lambdaEvent,
    addEnvVars: true,
    dockerArgs: ['-e', 'AWS_LAMBDA_FUNCTION_NAME=lambci-build'],
    spawnOptions: {encoding: 'utf8', stdio: 'inherit'},
  })
}

if (require.main == module) {
  runBuild()
}

