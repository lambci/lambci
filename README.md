### Note: This repo is in maintenance mode as we assess whether [Serverless GitHub Actions](https://github.com/lambci/serverless-actions) might provide a better experience going forward

<img align="left" src="https://lambci.s3.amazonaws.com/assets/logo-310x310.png" width="180px" height="180px">

# LambCI

*Serverless continuous integration*

[![Launch CloudFormation Stack](https://s3.amazonaws.com/cloudformation-examples/cloudformation-launch-stack.png)](https://console.aws.amazon.com/cloudformation/home?region=us-east-1#/stacks/new?stackName=lambci&templateURL=https://lambci.s3.amazonaws.com/templates/template.yaml)
[![Serverless App Repository](https://img.shields.io/badge/Available-serverless%20app%20repository-blue.svg)](https://serverlessrepo.aws.amazon.com/applications/arn:aws:serverlessrepo:us-east-1:553035198032:applications~lambci)
[![LambCI Build Status](https://lambci-public-buildresults-e3xwlufrwb3i.s3.amazonaws.com/gh/lambci/lambci/branches/master/2c03c00899d9b188a928a910320eacdc.svg)](https://lambci-public-buildresults-e3xwlufrwb3i.s3.amazonaws.com/gh/lambci/lambci/branches/master/8f82e6f4df48d23dead65035f625f5c0.html)
[![Gitter](https://img.shields.io/gitter/room/lambci/lambci.svg)](https://gitter.im/lambci/lambci)


---

Automate your testing and deployments with:

- 1000 concurrent builds out of the box (can request more)
- No maintenance of web servers, build servers or databases
- Zero cost when not in use (ie, [100% utilization](https://twitter.com/kannonboy/status/734799060440211456))
- Easy to integrate with the rest of your AWS resources

---

## Contents

* [Overview](#what-is-it)
* [Installation](#installation)
* [Configuration](#configuration)
* [Updating](#updating)
* [Security](#security)
* [Language Recipes](#language-recipes)
* [Extending with ECS](#extending-with-ecs)
* [Questions](#questions)

---

## What is it?

LambCI is a package you can upload to [AWS Lambda](https://aws.amazon.com/lambda/) that
gets triggered when you push new code or open pull requests on GitHub and runs your tests (in the Lambda environment itself) – in the same vein as Jenkins, Travis or CircleCI.

It integrates with Slack, and updates your Pull Request and other commit statuses on GitHub to let you know if you can merge safely.

![LambCI in action](https://lambci.s3.amazonaws.com/assets/demo.gif)

It can be easily launched and kept up-to-date as a [CloudFormation
Stack](https://aws.amazon.com/cloudformation/), or you can manually create the
different resources yourself.

## Installed languages

* Node.js 12.x (including `npm`/`npx`)
* Python 3.6 (including `pip`)
* Gcc 7.2 (including `c++`)

## Supported languages

* Check the [Recipes](#language-recipes) list below on how to configure these:
* Node.js (any version via [nave](https://github.com/isaacs/nave))
* Python ([3.8.0, 3.7.4, 3.6.9](#python))
* Java (OpenJDK [1.8.0](#java))
* Go ([any version](#go))
* Ruby ([2.7.0, 2.6.5, 2.5.7, 2.4.9, 2.3.8, 2.2.10, 2.1.10, 2.0.0-p648](#ruby))
* PHP ([7.3.13, 7.2.26, 7.1.33, 7.0.32, 5.6.38](#php))

## Prerequisites

* An [Amazon AWS account](https://portal.aws.amazon.com/gp/aws/developer/registration/index.html)
* A GitHub OAuth token ([see below](#1-create-a-github-token))
* (optional) A Slack API token ([see below](#2-create-a-slack-token-optional))

## Current Limitations (due to the Lambda environment itself)

* No root access
* 500MB disk space
* 15 min max build time
* Bring-your-own-binaries – Lambda has a limited selection of installed software
* 3.0GB max memory
* Linux only

You can get around many of these limitations by [configuring LambCI to send tasks to an ECS cluster](#extending-with-ecs) where you can run your builds in Docker.

## Installation

You don't need to clone this repository – the easiest way to install LambCI is to [deploy it from the Serverless Application Repository](https://serverlessrepo.aws.amazon.com/applications/arn:aws:serverlessrepo:us-east-1:553035198032:applications~lambci) or [directly spin up a CloudFormation stack](https://console.aws.amazon.com/cloudformation/home?region=us-east-1#/stacks/new?stackName=lambci&templateURL=https://lambci.s3.amazonaws.com/templates/template.yaml). This will create a collection of related AWS resources, including the main LambCI Lambda function and DynamoDB tables, that you can update or remove together – it should take around 3 minutes to spin up.

You can use multiple repositories from the one stack, and you can run multiple stacks with different names side-by-side too (eg, `lambci-private` and `lambci-public`).

If you'd prefer to run your stack after cloning this repository, you can use `npm run deploy` – this depends on [AWS SAM CLI](https://github.com/awslabs/aws-sam-cli) being installed.

### 1. Create a GitHub token

You can create a token in the [Personal access tokens](https://github.com/settings/tokens) section of your GitHub settings. If you're setting up LambCI for an organization, it might be a good idea to create a separate GitHub user dedicated to running automated builds (GitHub calls these "machine users") – that way you have more control over which repositories this user has access to.

Click the [Generate new token](https://github.com/settings/tokens/new) button and then select the appropriate access levels.

LambCI only needs read access to your code, but unfortunately GitHub webhooks have rather crude access mechanisms and don't have a readonly scope for private repositories – the only options is to choose `repo` ("Full control").

<img alt="Private GitHub access" src="https://lambci.s3.amazonaws.com/assets/private_github_2.png" width="555" height="318">

If you're only using LambCI for public repositories, then you just need access to commit statuses:

<img alt="Public GitHub access" src="https://lambci.s3.amazonaws.com/assets/public_github_2.png" width="538" height="216">

Then click the "Generate token" button and GitHub will generate a 40 character hex OAuth token.

### 2. Create a Slack token (optional)

You can obtain a Slack API token by creating a bot user (or you can use the token from an existing bot user if you have one) – [this direct link](https://slack.com/apps/new/A0F7YS25R-bots) should take you there, but you can navigate from the [App Directory](https://slack.com/apps) via `Browse Apps > Custom Integrations > Bots`.

Pick any name, and when you click "Add integration" Slack will generate an API token that looks something like `xoxb-<numbers>-<letters>`

<img alt="Add Slack bot" src="https://lambci.s3.amazonaws.com/assets/slack_bot_2.png" width="622" height="528">

### 3. Launch the LambCI CloudFormation stack

You can either [deploy it from the Serverless Application Repository](https://serverlessrepo.aws.amazon.com/applications/arn:aws:serverlessrepo:us-east-1:553035198032:applications~lambci) or [use this direct CloudFormation link](https://console.aws.amazon.com/cloudformation/home?region=us-east-1#/stacks/new?stackName=lambci&templateURL=https://lambci.s3.amazonaws.com/templates/template.yaml) or navigate in your AWS Console to `Services > CloudFormation`, choose "Create Stack" and use the [S3 link](https://lambci.s3.amazonaws.com/templates/template.yaml):

<img alt="CloudFormation Step 1" src="https://lambci.s3.amazonaws.com/assets/cfn1_2.png" width="404" height="63">

Then click Next where you can enter a stack name (`lambci` is a good default),
API tokens and a Slack channel – you'll also need to
[make up a secret to secure your webhook](https://developer.github.com/webhooks/securing/) and enter it as the
`GithubSecret` – any randomly generated value is good here, but make sure you
still have it handy to enter when you setup your webhooks in GitHub later on.

<img alt="CloudFormation Step 2" src="https://lambci.s3.amazonaws.com/assets/cfn2_3.png" width="689" height="558">

Click Next, and then Next again on the Options step (leaving the default options selected), to get to the final Review step:

<img alt="CloudFormation Step 3" src="https://lambci.s3.amazonaws.com/assets/cfn3_2.png" width="689" height="538">

Check the acknowledgments, click Create Change Set and then Execute to start the resource creation process:

<img alt="CloudFormation Step 4" src="https://lambci.s3.amazonaws.com/assets/cfn4.png">

Once your stack is created (should be done in a few minutes) you're ready to add the webhook to any repository you like!

You can get the WebhookUrl from the Outputs of the CloudFormation stack:

<img alt="CloudFormation Step 5" src="https://lambci.s3.amazonaws.com/assets/cfn5.png" width="758" height="177">

Then create a new Webhook in any GitHub repo you want to trigger under
`Settings > Webhooks` (`https://github.com/<user>/<repo>/settings/hooks/new`)
and enter the `WebhookUrl` from above as the Payload URL, ensure Content type
is `application/json` and enter the `GithubSecret` you generated in the first step as the Secret:

<img alt="GitHub Webhook Step 1" src="https://lambci.s3.amazonaws.com/assets/webhook1.png" width="498" height="652">

Assuming you want to respond to Pull Requests as well as Pushes, you'll need to choose
"Let me select individual events", and check Pushes and Pull requests.

<img alt="GitHub Webhook Step 2" src="https://lambci.s3.amazonaws.com/assets/webhook2.png" width="772" height="261">

Then "Add webhook" and you're good to go!

By default LambCI only responds to pushes on the master branch and pull
requests ([you can configure this](#configuration)), so try either of those –
if nothing happens, then check `Services > CloudWatch > Logs` in the AWS
Console and see the [Questions](#questions) section below.

### Installing as a nested stack in another CloudFormation stack

You can also embed LambCI in your own stack, using a `AWS::Serverless::Application` resource:

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31

Resources:
  LambCI:
    Type: AWS::Serverless::Application
    Properties:
      Location:
        ApplicationId: arn:aws:serverlessrepo:us-east-1:553035198032:applications/lambci
        SemanticVersion: 0.11.2
      Parameters:
        GithubToken: '123456789abcdef123456789abcdef123456789'
        GithubSecret: 'my-web-secret'
        SlackChannel: '#general'
        SlackToken: 'xoxb-123456789-abcdefABCDEFabcdef'

Outputs:
  S3Bucket:
    Description: Name of the build results S3 bucket
    Value: !GetAtt LambCI.Outputs.S3Bucket
  WebhookUrl:
    Description: GitHub webhook URL
    Value: !GetAtt LambCI.Outputs.WebhookUrl
```

If you save the above as `template.yml`, then you can use the
[AWS SAM CLI](https://github.com/awslabs/aws-sam-cli) to deploy from the same directory:

```console
sam deploy --stack-name lambci --capabilities CAPABILITY_IAM CAPABILITY_AUTO_EXPAND
```

## Configuration

Many configuration values can be specified in a `.lambci.js`, `.lambci.json` or `package.json` file in the root of your repository – and all values can be set in the DynamoDB configuration table (named `<stack>-config`, eg, `lambci-config`)

For example, the default command that LambCI will try to run is `npm ci && npm test`, but let's say you have a python project – you could put the following in `.lambci.json` in your repository root:

```json
{
  "cmd": "pip install --user tox && tox"
}
```
(LambCI bundles `pip` and adds `$HOME/.local/bin` to `PATH`)

If you have a more complicated build setup, then you could specify `make` or create a bash script in your repository root:

```json
{
  "cmd": "./lambci-test.sh"
}
```

### Overriding default properties

LambCI resolves configuration by overriding properties in a cascading manner in the following order:

1. Default config ([see below](#default-configuration))
2. `global` project key in `lambci-config` DynamoDB table
3. `gh/<user>/<repo>` project key in `lambci-config` DynamoDB table
4. `lambci` property in `package.json` file in repository root
5. `.lambci.js` or `.lambci.json` file in repository root

You can use the [command line](https://github.com/lambci/cli) to edit the DynamoDB config values:

```console
lambci config secretEnv.GITHUB_TOKEN abcdef01234
lambci config --project gh/mhart/kinesalite secretEnv.SLACK_TOKEN abcdef01234
```

Or the AWS console:

![Global config in DynamoDB](https://lambci.s3.amazonaws.com/assets/global_config.png)

So if you wanted to use a different Slack token and channel for a particular project, you could create an item in the config table with the project key `gh/<user>/<repo>` that looks similar to the global config above, but with different values:

```js
{
  project: 'gh/mhart/kinesalite',
  secretEnv: {
    SLACK_TOKEN: 'xoxb-1234243432-vnjcnioeiurn'
  },
  notifications: {
    slack: {
      channel: '#someotherchannel'
    }
  }
}
```

Using the [command line](https://github.com/lambci/lambci):

```console
lambci config --project gh/mhart/kinesalite secretEnv.SLACK_TOKEN xoxb-1234243432-vnjcnioeiurn
lambci config --project gh/mhart/kinesalite notifications.slack.channel '#someotherchannel'
```


### Config file overrides

Here's an example `package.json` overriding the `cmd` property:

```json
{
  "name": "some-project",
  "scripts": {
    "lambci-build": "eslint . && mocha"
  },
  "lambci": {
    "cmd": "npm ci && npm run lambci-build"
  }
}
```

And the same example using `.lambci.js`:

```js
module.exports = {
  cmd: 'npm ci && npm run lambci-build'
}
```

The ability to override config properties using repository files depends on the `allowConfigOverrides` property ([see the default config below](#default-configuration)).

### Branch and pull request properties

Depending on whether LambCI is building a branch from a push or a pull request, config properties can also be specified to override in these cases.

For example, to determine whether a build should even take place, LambCI looks at the top-level `build` property of the configuration. By default this is actually `false`, but if the branch is `master`, then LambCI checks for a `branches.master` property and if it's set, uses that instead:

```js
{
  build: false,
  branches: {
    master: true
  }
}
```
If a branch just has a `true` value, this is the equivalent of `{build: true}`, so you can override other properties too – ie, the above snippet is just shorthand for:
```js
{
  build: false,
  branches: {
    master: {
      build: true
    }
  }
}
```
So if you wanted Slack notifications to go to a different channel to the default for the `develop` branch, you could specify:

```js
{
  branches: {
    master: true,
    develop: {
      build: true,
      notifications: {
        slack: {
          channel: '#dev'
        }
      }
    }
  }
}
```

You can also use regular expression syntax to specify config for branches that
match, or don't match (if there is a leading `!`). Exact branch names are
checked first, then the first matching regex (or negative regex) will be used:

```js
// 1. Don't build gh-pages branch
// 2. Don't build branches starting with 'dev'
// 3. Build any branch that doesn't start with 'test-'
{
  build: false,
  branches: {
    '/^dev/': false,
    '!/^test-/': true,
    'gh-pages': false,
  }
}
```

### Default configuration

This configuration is hardcoded in `utils/config.js` and overridden by any config from the DB (and config files)

```js
{
  cmd: 'npm ci && npm test',
  env: { // env values exposed to build commands
  },
  secretEnv: { // secret env values, exposure depends on inheritSecrets config below
    GITHUB_TOKEN: '',
    GITHUB_SECRET: '',
    SLACK_TOKEN: '',
  },
  s3Bucket: '', // bucket to store build artifacts
  notifications: {
    slack: {
      channel: '#general',
      username: 'LambCI',
      iconUrl: 'https://lambci.s3.amazonaws.com/assets/logo-48x48.png',
      asUser: false,
    },
  },
  build: false, // Build nothing by default except master and PRs
  branches: {
    master: true,
  },
  pullRequests: {
    fromSelfPublicRepo: true, // Pull requests from same (private) repo will build
    fromSelfPrivateRepo: true, // Pull requests from same (public) repo will build
    fromForkPublicRepo: { // Restrictions for pull requests from forks on public repos
      build: true,
      inheritSecrets: false, // Don't expose secretEnv values in the build command environment
      allowConfigOverrides: ['cmd', 'env'], // Only allow file config to override cmd and env properties
    },
    fromForkPrivateRepo: false, // Pull requests from forked private repos won't run at all
  },
  s3PublicSecretNames: true, // Use obscured names for build HTML files and make them public. Has no effect in public repositories
  inheritSecrets: true, // Expose secretEnv values in the build command environment by default
  allowConfigOverrides: true, // Allow files to override config values
  clearTmp: true, // Delete /tmp each time for safety
  git: {
    depth: 5, // --depth parameter for git clone
  },
}
```

### SNS Notifications (for email, SMS, etc)

By default, the CloudFormation template doesn't create an SNS topic to publish build statuses (ie, success, failure) to – but if you want to receive build notifications via email or SMS, or some other custom SNS subscriber, you can specify an SNS topic and LambCI will push notifications to it:

```js
notifications: {
  sns: {
    topicArn: 'arn:aws:sns:us-east-1:1234:lambci-StatusTopic-1WF8BT36'
  }
}
```

The Lambda function needs to have permissions to publish to this topic, which you can either add manually, or by modifying the CloudFormation `template.yaml` and updating your stack.

Add a top-level SNS topic resource (a commented-out example of this exists in `template.yaml`):

```yaml
  StatusTopic:
    Type: AWS::SNS::Topic
    Properties:
      DisplayName: LambCI
```
And ensure the Lambda function has permissions to publish to it:
```yaml
  BuildLambda:
    Type: AWS::Serverless::Function
    Properties:
      # ...
      Policies:
        # ...
        - SNSPublishMessagePolicy:
            TopicName: !Ref StatusTopic
```

### Build status badges

Each branch has a build status image showing whether the last build was successful or not.
For example, here is LambCI's latest `master` status (yes, LambCI dogfoods!):

[![LambCI Build Status](https://lambci-public-buildresults-e3xwlufrwb3i.s3.amazonaws.com/gh/lambci/lambci/branches/master/2c03c00899d9b188a928a910320eacdc.svg)](https://lambci-public-buildresults-e3xwlufrwb3i.s3.amazonaws.com/gh/lambci/lambci/branches/master/8f82e6f4df48d23dead65035f625f5c0.html)

You can see the URLs for the branch log and badge image near the start of the
output of your build logs (so you'll need to run at least one build on your
branch to get these):

```
Branch log: https://<bucket>/<project>/branches/master/<somehash>.html
Branch status img: https://<bucket>/<project>/branches/master/<somehash>.svg
```

## Updating

You can update your CloudFormation stack at any time to change, add or remove the parameters – or even upgrade to a new version of LambCI.

In the AWS Console, go to `Services > CloudFormation`, select your LambCI stack in the list and then choose `Actions > Update Stack`. You can keep the same template selected (unless you're updating LambCI), and then when you click Next you can modify parameters like your GitHub token, Slack channel, etc.

LambCI will do its best to update these parameters correctly, but if it fails or you run into trouble, just try setting them all to blank, updating, and then update again with the values you want.

If you've (only) modified `template.yaml` locally, then you'll need to run `npm run template` and use `build/versioned.yaml` to update your stack.

If you've modified other LambCI code locally, you can update with `npm run deploy` – this requires [AWS SAM CLI](https://github.com/awslabs/aws-sam-cli) to be installed.

### Updating to 0.10.0 from earlier versions

Updating to 0.10.0 should Just Work™ using the new template – however GitHub
[shut down the use of SNS hooks](https://developer.github.com/changes/2018-04-25-github-services-deprecation/),
which is how LambCI was previously triggered, so you'll need to go through any
repositories on GitHub that you had setup with previous LambCI versions, remove
the SNS hook if it wasn't removed already (in `Settings`), and add the new webhook as laid out
in [Installation](#installation).

## Security

The default configuration passes secret environment variables to build commands, except when building forked repositories. This allows you to use your AWS credentials and Git/Slack tokens in your build commands to communicate with the rest of your stack. Set `inheritSecrets` to false to prevent this.

HTML build logs are generated with random filenames, but are accessible to anyone who has the link. Set `s3PublicSecretNames` to false (only works for private repositories) to make build logs completely private (you'll need to use the AWS console to access them), or you can remove `s3Bucket` entirely – you can still see the build logs in the Lambda function output in CloudWatch Logs.

By default, the `/tmp` directory is removed each time – this is to prevent secrets from being leaked if your LambCI stack is building both private and public repositories. However, if you're only building private (trusted) repositories, then you can set the `clearTmp` config to false, and potentially cache files (eg, in `$HOME`) for use across builds (this is not guaranteed – it depends on whether the Lambda environment is kept "warm").

If you discover any security issues with LambCI please email [security@lambci.org](mailto:security@lambci.org).

## Language Recipes

The default command is `npm ci && npm test` which will use Node.js 12.14.1 and npm 6.13.6.

The way to build with different Node.js versions, or other languages entirely,
is just to override the `cmd` config property.

LambCI comes with a collection of helper scripts to setup your environment
for languages not supported out of the box on AWS Lambda – that is,
every language except Node.js and Python 3.6

### Node.js

LambCI comes with [nave](https://github.com/isaacs/nave) installed and
available on the `PATH`, so if you wanted to run your npm install and tests
using Node.js v10.x, you could do specify:

```json
{
  "cmd": "nave use 10 bash -c 'npm ci && npm test'"
}
```

If you're happy using the built-in npm to install, you could simplify this a little:

```json
{
  "cmd": "npm ci && nave use 10 npm test"
}
```

There's currently no way to run multiple builds in parallel but you could
have processes run in parallel using a tool like
[npm-run-all](https://github.com/mysticatea/npm-run-all) – the logs will be a
little messy though!

Here's an example package.json for running your tests in Node.js v8, v10 and v12 simultaneously:

```json
{
  "lambci": {
    "cmd": "npm ci && npm run ci-all"
  },
  "scripts": {
    "ci-all": "run-p ci:*",
    "ci:node8": "nave use 8 npm test",
    "ci:node10": "nave use 10 npm test",
    "ci:node12": "nave use 12 npm test"
  },
  "devDependencies": {
    "npm-run-all": "*"
  }
}
```

### Python

LambCI comes with [pip](https://pip.pypa.io) installed and available on the
`PATH`, and Lambda has Python 3.6 already installed. `$HOME/.local/bin` is also
added to `PATH`, so local pip installs should work:

```json
{
  "cmd": "pip install --user tox && tox"
}
```

### Other Python versions with pyenv

LambCI comes with [pyenv](https://github.com/pyenv/pyenv) installed and a
script you can source to setup the pyenv root and download prebuilt
versions for you.

Call it with the Python version you want (currently: `3.8.0`, `3.7.4`, `3.6.9` or
`system`, which will use the 3.6 version already installed on Lambda):

```json
{
  "cmd": ". ~/init/python 3.8.0 && pip install --user tox && tox"
}
```

### Java

The Java SDK is not installed on AWS Lambda, so needs to be downloaded as part of
your build – but the JRE *does* exist on Lambda, so the overall impact is small.

LambCI includes a script you can source before running your build commands
that will install and setup the SDK correctly, as well as Maven (v3.6.3). Call
it with the OpenJDK version you want (currently only `1.8.0`):

```json
{
  "cmd": ". ~/init/java 1.8.0 && mvn install -B -V && mvn test"
}
```

You can see an example of this working
[here](https://github.com/mhart/test-ci-project/blob/71815a5e74d45f7ebb4682468587cfa352eae925/build-java-1.7.sh) –
and the resulting [build log](https://lambci-public-buildresults-e3xwlufrwb3i.s3.amazonaws.com/gh/mhart/test-ci-project/builds/126/c03f86b6841738f6816a6146910b2435.html).

### Go

Go is not installed on AWS Lambda, so needs to be downloaded as part of
your build, but Go is quite small and well suited to running anywhere.

LambCI includes a script you can source before running your build commands
that will install Go and set your `GOROOT` and `GOPATH` with the correct
directory structure. Call it with the Go version you want (any of the versions
[on the Go site](https://golang.org/dl/)):

```json
{
  "cmd": ". ~/init/go 1.13.5 && make test"
}
```

You can see examples of this working
[here](https://github.com/mhart/test-ci-project/blob/71815a5e74d45f7ebb4682468587cfa352eae925/build-go.sh) –
and the resulting [build log](https://lambci-public-buildresults-e3xwlufrwb3i.s3.amazonaws.com/gh/mhart/test-ci-project/builds/124/f8ddb3de3e00ea0faffdf59ddf7e8658.html).

### Ruby

Ruby is not installed on AWS Lambda, so needs to be downloaded as part of
your build.

LambCI includes a script you can source before running your build commands
that will install Ruby, rbenv, gem and bundler. Call it with the Ruby version
you want (currently: `2.7.0`, `2.6.5`, `2.5.7`, `2.4.9`, `2.3.8`, `2.2.10`, `2.1.10` or `2.0.0-p648`):

```json
{
  "cmd": ". ~/init/ruby 2.7.0 && bundle install && bundle exec rake"
}
```

You can see an example of this working
[here](https://github.com/mhart/test-ci-project/blob/71815a5e74d45f7ebb4682468587cfa352eae925/build-ruby.sh) –
and the resulting [build log](https://lambci-public-buildresults-e3xwlufrwb3i.s3.amazonaws.com/gh/mhart/test-ci-project/builds/123/05b9f81a9ca8599dc7fbea67ce2a62ad.html).

### PHP

PHP is not installed on AWS Lambda, so needs to be downloaded as part of
your build.

LambCI includes a script you can source before running your build commands
that will install PHP, phpenv and composer. Call it with the PHP version
you want (currently: `7.3.13`, `7.2.26`, `7.1.33`, `7.0.32` or `5.6.38`):

```json
{
  "cmd": ". ~/init/php 7.3.13 && composer install -n --prefer-dist && vendor/bin/phpunit"
}
```

These versions are compiled using [php-build](https://github.com/php-build/php-build) with the
[default config options](https://github.com/php-build/php-build/blob/7f2fe024f64793d15c82f2932dd9cf73aa3273ec/share/php-build/default_configure_options)
and overrides of `--disable-cgi` and `--disable-fpm`.


You can see an example of this working
[here](https://github.com/mhart/test-ci-project/blob/3f26c1d2a6d963c54fec8b24cc439bece894e033/build-php.sh) –
and the resulting [build log](https://lambci-public-buildresults-e3xwlufrwb3i.s3.amazonaws.com/gh/mhart/test-ci-project/builds/140/3e9954f8a74dda5f4050b65bcf56cde8.html).

## Extending with ECS

LambCI can run tasks on an ECS cluster, which means you can perform all of your build tasks in a Docker container and not be subject to the same restrictions you have in the Lambda environment.

This needs to be documented further – for now you'll have to go off the source and check out the [lambci/ecs](https://github.com/lambci/ecs) repo.

## Questions

### What does the Lambda function do?

  1. Receives notification from GitHub (via a webhook)
  1. Looks up config in DynamoDB
  1. Clones git repo using a bundled git binary
  1. Looks up config files in repo
  1. Runs install and build cmds on Lambda (or starts ECS task)
  1. Updates Slack and GitHub statuses along the way (optionally SNS for email, etc)
  1. Uploads build logs/statuses to S3

## License

MIT
