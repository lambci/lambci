<img align="left" src="https://lambci.s3.amazonaws.com/assets/logo-310x310.png" width="180px" height="180px">

# LambCI

*Serverless continuous integration*

[![Launch CloudFormation Stack](https://s3.amazonaws.com/cloudformation-examples/cloudformation-launch-stack.png)](https://console.aws.amazon.com/cloudformation/home?region=us-east-1#/stacks/new?stackName=lambci&templateURL=https://lambci.s3.amazonaws.com/templates/lambci.template)
[![LambCI Build Status](https://lambci-public-buildresults-e3xwlufrwb3i.s3.amazonaws.com/gh/lambci/lambci/branches/master/2c03c00899d9b188a928a910320eacdc.svg)](https://lambci-public-buildresults-e3xwlufrwb3i.s3.amazonaws.com/gh/lambci/lambci/branches/master/8f82e6f4df48d23dead65035f625f5c0.html)
[![Gitter](https://img.shields.io/gitter/room/lambci/lambci.svg)](https://gitter.im/lambci/lambci)


---

Automate your testing and deployments with:

- 100 concurrent builds out of the box (can request more)
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

(Support for running under [Google Cloud
Functions](https://cloud.google.com/functions/) may be added in the near
future, depending on the API they settle on)

## Supported languages

* Node.js (multiple versions via [nave](https://github.com/isaacs/nave))
* Python 2.7
* Java (OpenJDK 1.8 – [1.7 coming soon](https://github.com/lambci/lambci/issues/14))
* Go (any version – [can manually bootstrap](#go))
* Ruby (2.3.1, 2.2.5, 2.1.9, 2.0.0-p648 [using rbenv](#ruby))
* Native compilation with a [pre-built gcc 4.8.5](#native-gcc-compilation)
* Check the [Recipes](#language-recipes) list below for the status of other languages/tools

## Prerequisites

* An [Amazon AWS account](https://portal.aws.amazon.com/gp/aws/developer/registration/index.html)
* A GitHub OAuth token ([see below](#1-create-a-github-token))
* (optional) A Slack API token ([see below](#2-create-a-slack-token-optional))

## Current Limitations (due to the Lambda environment itself)

* No root access
* 5 min max build time
* Bring-your-own-binaries – Lambda has a limited selection of installed software
* 1.5GB max memory
* Linux only

You can get around many of these limitations by [configuring LambCI to send tasks to an ECS cluster](#extending-with-ecs) where you can run your builds in Docker.

## Installation

The easiest way to install LambCI is to [spin up a CloudFormation stack](https://console.aws.amazon.com/cloudformation/home?region=us-east-1#/stacks/new?stackName=lambci&templateURL=https://lambci.s3.amazonaws.com/templates/lambci.template) using [lambci.template](https://github.com/lambci/lambci/blob/master/lambci.template) – this is just a collection of related AWS resources, including the main LambCI Lambda function and DynamoDB tables, that you can update or remove together – it should take around 3-4 minutes to spin up.

You can run multiple stacks with different names side-by-side too (eg, `lambci-private` and `lambci-public`).

As part of the stack setup, you can supply your GitHub and Slack API tokens, as well as a list of repositories you want to trigger LambCI, but you don't have to – you can add these later, either by [updating the CloudFormation stack](#updating), or using the AWS DynamoDB console or [lambci command line](https://github.com/lambci/cli). If you'd prefer to do that, you can skip straight to Step 3.

### 1. Create a GitHub token

You can create a token in the [Personal access tokens](https://github.com/settings/tokens) section of your GitHub settings. If you're setting up LambCI for an organization, it might be a good idea to create a separate GitHub user dedicated to running automated builds (GitHub calls these "machine users") – that way you have more control over which repositories this user has access to.

Click the [Generate new token](https://github.com/settings/tokens/new) button and then select the appropriate access levels.

LambCI only needs read access to your code, but unfortunately GitHub has rather crude access mechanisms and doesn't have a readonly scope for private repositories – the only options is to choose `repo` ("Full control"). [Other CI systems have the same frustrations](https://docs.travis-ci.com/user/github-oauth-scopes/#Travis-CI-for-Private-Projects).

![Private GitHub access](https://lambci.s3.amazonaws.com/assets/private_github.png)

If you're only using LambCI for public repositories, then you just need access to commit statuses and repository hooks (even the latter you can do away with if you're adding/removing the hooks manually):

![Public GitHub access](https://lambci.s3.amazonaws.com/assets/public_github.png)

Then click the "Generate token" button and GitHub will generate a 40 character hex API token.

### 2. Create a Slack token (optional)

You can obtain a Slack API token by creating a bot user (or you can use the token from an existing bot user if you have one) – [this direct link](https://slack.com/apps/new/A0F7YS25R-bots) should take you there, but you can navigate from the [App Directory](https://slack.com/apps) via `Browse Apps > Custom Integrations > Bots`.

Pick any name, and when you click "Add integration" Slack will generate an API token that looks something like `xoxb-<numbers>-<letters>`

![Add Slack bot](https://lambci.s3.amazonaws.com/assets/slack_bot.png)

### 3. Launch the LambCI CloudFormation stack

You can either [use this direct link](https://console.aws.amazon.com/cloudformation/home?region=us-east-1#/stacks/new?stackName=lambci&templateURL=https://lambci.s3.amazonaws.com/templates/lambci.template) or navigate in your AWS Console to `Services > CloudFormation`, choose "Create Stack" and upload `lambci.template` from the root of this repository, or use the [S3 link](https://lambci.s3.amazonaws.com/templates/lambci.template):

![CloudFormation Step 1](https://lambci.s3.amazonaws.com/assets/cfn1.png)

Then click Next where you can enter a stack name (`lambci` is a good default), API tokens, Slack channel and a comma-separated list of any repositories you want to add hooks to:

![CloudFormation Step 2](https://lambci.s3.amazonaws.com/assets/cfn2.png)

Click Next, and then Next again on the Options step (leaving the default options selected), to get to the final Review step:

![CloudFormation Step 3](https://lambci.s3.amazonaws.com/assets/cfn3.png)

Check the acknowledgment checkbox and click Create to start the resource creation process:

![CloudFormation Step 4](https://lambci.s3.amazonaws.com/assets/cfn4.png)

Once your stack is created (should be done in a few minutes) you're ready to start building!

By default LambCI only responds to pushes on the master branch and pull requests ([you can configure this](#configuration)), so try either of those – if nothing happens, then check `Services > CloudWatch > Logs` in the AWS Console and see the [Questions](#questions) section below.

You can check that the hooks have been installed in a repository correctly by going to `Settings > Webhooks and services` on the GitHub repository page (ie, `https://github.com/<user>/<repo>/settings/hooks`). There should be a Service listed as `Amazon SNS` – if you click the edit (pencil) button then you can choose to "Test Service" (it should send a push event).

## Configuration

Many configuration values can be specified in a `.lambci.js`, `.lambci.json` or `package.json` file in the root of your repository – and all values can be set in the DynamoDB configuration table (named `<stack>-config`, eg, `lambci-config`)

For example, the default command that LambCI will try to run is `npm install && npm test`, but let's say you have a python project – you could put the following in `.lambci.json` in your repository root:

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
    "cmd": "npm install && npm run lambci-build"
  }
}
```

And the same example using `.lambci.js`:

```js
module.exports = {
  cmd: 'npm install && npm run lambci-build'
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
  cmd: 'npm install && npm test',
  env: { // env values exposed to build commands
  },
  secretEnv: { // secret env values, exposure depends on inheritSecrets config below
    GITHUB_TOKEN: '',
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
  s3PublicSecretNames: true, // Use obscured names for build HTML files and make them public
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

The Lambda function needs to have permissions to publish to this topic, which you can either add manually, or by modifying the CloudFormation `lambci.template` and updating your stack.

Add a top-level SNS topic resource:

```
"StatusTopic" : {
  "Type": "AWS::SNS::Topic",
  "Properties": {
    "DisplayName": "LambCI"
  }
}
```
And then add the following to the `LambdaExecution.Properties.Policies` array to give the Lambda function the correct permissions:
```
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

In the AWS Console, go to `Services > CloudFormation`, select your LambCI stack in the list and then choose `Actions > Update Stack`. You can keep the same template selected (unless you're updating LambCI and the template has different resources), and then when you click Next you can modify parameters like your GitHub token, repositories, Slack channel, LambCI version, etc.

LambCI will do its best to update these parameters correctly, but if it fails or you run into trouble, just try setting them all to blank, updating, and then update again with the values you want.

## Security

The default configuration passes secret environment variables to build commands, except when building forked repositories. This allows you to use your AWS credentials and Git/Slack tokens in your build commands to communicate with the rest of your stack. Set `inheritSecrets` to false to prevent this.

HTML build logs are generated with random filenames, but are accessible to anyone who has the link. Set `s3PublicSecretNames` to false to make build logs completely private (you'll need to use the AWS console to access them), or you can remove `s3Bucket` entirely – you can still see the build logs in the Lambda function output in CloudWatch Logs.

By default, the `/tmp` directory is removed each time – this is to prevent secrets from being leaked if your LambCI stack is building both private and public repositories. However, if you're only building private (trusted) repositories, then you can set the `clearTmp` config to false, and potentially cache files (eg, in `$HOME`) for use across builds (this is not guaranteed – it depends on whether the Lambda environment is kept "warm").

If you discover any security issues with LambCI please email [security@lambci.org](mailto:security@lambci.org).

## Language Recipes

LambCI doesn't currently have any language-specific settings. The default command is `npm install && npm test` which will use the default Lambda version of Node.js (4.3.x) and npm (2.x).

The way to build with different Node.js versions, or other languages entirely, is just to override the `cmd` config property (specifying a `test` property in a `package.json` file would work too).

### Node.js

LambCI comes with [nave](https://github.com/isaacs/nave) installed and available on the `PATH`, so if you wanted to run your npm install and tests using the latest Node.js v6.x and npm v3.x, you could do specify:

```json
{
  "cmd": "nave use 6 bash -c 'npm install && npm test'"
}
```

If you're happy using the built-in npm to install, you could simplify this a little:

```json
{
  "cmd": "npm install && nave use 6 npm test"
}
```

There's [currently no way to run multiple builds in parallel]() but you could have processes run in parallel using a tool like [npm-run-all](https://github.com/mysticatea/npm-run-all) – the logs will be a little messy though!

Here's an example package.json for running your tests in Node.js v4, v5 and v6 simultaneously:

```json
{
  "lambci": {
    "cmd": "npm install && npm run ci"
  },
  "scripts": {
    "ci": "run-p ci:*",
    "ci:node4": "nave use 4 npm test",
    "ci:node5": "nave use 5 npm test",
    "ci:node6": "nave use 6 npm test"
  },
  "devDependencies": {
    "npm-run-all": "*"
  }
}
```

### Python 2.7

LambCI comes with [pip](https://pip.pypa.io) installed and available on the `PATH`, and Lambda has Python 2.7 already installed. `$HOME/.local/bin` is also added to `PATH`, so local pip installs should work:

```json
{
  "cmd": "pip install --user tox && tox"
}
```

### Java

The Java SDK is not installed on Lambda, so needs to be downloaded as part of
your build – but the JRE *does* exist on Lambda, so the overall impact isn't big
– bootstrapping takes seconds. You just need to make sure the correct
environment variables are set before installing and building – the script below
shows you how to set that up:

```bash
#!/bin/bash -ex

export JAVA_HOME=/tmp/usr/lib/jvm/java-1.8.0-openjdk-1.8.0.77-0.b03.9.amzn1.x86_64
export PATH=$JAVA_HOME/bin:$PATH
export _JAVA_OPTIONS=-Duser.home=$HOME

if ! [ -d $JAVA_HOME ]; then
  curl -sSL https://lambci.s3.amazonaws.com/binaries/java-1.8.0-openjdk-devel.tgz | tar -C /tmp -xz

  # Symlink the JRE in, and physically copy libjvm.so
  cp -as /usr/lib/jvm/java-1.8*/jre $JAVA_HOME/
  rm $JAVA_HOME/jre/lib/amd64/server/libjvm.so
  cp /usr/lib/jvm/java-1.8*/jre/lib/amd64/server/libjvm.so $JAVA_HOME/jre/lib/amd64/server/
fi

# If you want Maven
if ! [ -d ~/apache-maven-3.3.9 ]; then
  curl -sSL http://www-us.apache.org/dist/maven/maven-3/3.3.9/binaries/apache-maven-3.3.9-bin.tar.gz | tar -xz -C ~
fi
export PATH=~/apache-maven-3.3.9/bin:$PATH
```

Then you can run your `mvn` install and test steps.

You can see examples of this working
[here](https://github.com/mhart/test-ci-project/commit/a5dbc8078d191d4155af81da0d6aa7dd56ade840).

### Go

The go toolchain is not installed on Lambda already and is too big to include
in the LambCI package, but it's very easy (and quick) to install as part of
your build – and if your Lambda process stays warm, then you won't need to
install it again. Just add something like this before your build/test commands:

```bash
#!/bin/bash -ex

VERSION=1.6.2

if ! [ -d $HOME/go ]; then
  curl -sSL https://storage.googleapis.com/golang/go${VERSION}.linux-amd64.tar.gz | tar -C $HOME -xz
fi

export GOROOT=$HOME/go
export PATH=$PATH:$GOROOT/bin
```
(then be sure to set `GOPATH` correctly)

You can see examples of this working
[here](https://github.com/mhart/test-ci-project/blob/master/build-go.sh) and
[here](https://github.com/mhart/test-ci-project/blob/master/build-go-make.sh).

### Ruby

Ruby is a little more complicated due to a lack of easily-installed Ruby binaries in the Lambda environment.
However, with a relatively short bootstrapping script, you can get one of the following versions running:

* 2.3.1
* 2.2.5
* 2.1.9
* 2.0.0-p648

We can compile more versions if there's sufficient demand for it, and we'll
probably look at adding `rbenv` before running your scripts (in the same way we do with `pip`),
so you won't need to bootstrap to this extent in the future:

```bash
#!/bin/bash -ex

VERSION=2.3.1

# First grab libyaml and put it in our ~/usr/lib64 directory
curl -sSL https://lambci.s3.amazonaws.com/binaries/libyaml-2.0.4.tgz | tar -C ~ -xz

# Now install rbenv
if ! [ -d ~/.rbenv ]; then
  git clone --depth 1 https://github.com/rbenv/rbenv.git ~/.rbenv
fi
export PATH="$HOME/.rbenv/bin:$PATH"
eval "$(rbenv init -)"

# We don't need to install documentation with gems
echo "gem: --no-document" > ~/.gemrc

# We want pretty colors in our output
echo "--color --tty" > ~/.rspec

# Grab the Ruby version we want and install bundler
if ! [ -d ~/.rbenv/versions/$VERSION ]; then
  curl -sSL https://lambci.s3.amazonaws.com/binaries/ruby-${VERSION}.tgz | tar -C ~/.rbenv/versions -xz
  rbenv rehash
  rbenv local $VERSION
  gem install bundler
else
  rbenv local $VERSION
fi
```

You can then run `bundle install`, etc to install and test your project

You can see an example of this working
[here](https://github.com/mhart/test-ci-project/commit/f44d1bcad1964ce116651090c1dbe2710a953640).

### Native (gcc) compilation

Lambda also has no native compiler, so you need to download one as part of your build process.
We have a precompiled gcc 4.8.5 that works in the Lambda environment with a full set of linux headers.
Native compilation is finicky at best, especially when installed in a non-default location,
so it may not work out-of-the-box for complicated libraries that depend on other headers/libraries.
Use a script like this to get started:

```bash
#!/bin/bash -ex

curl -sSL https://lambci.s3.amazonaws.com/binaries/gcc-4.8.5.tgz | tar -C /tmp -xz

export PATH=/tmp/bin:/tmp/sbin:$PATH
export LD_LIBRARY_PATH=/usr/local/lib64/node-v4.3.x/lib:/tmp/lib:/tmp/lib64:/lib64:/usr/lib64:/var/runtime:/var/task:/var/task/lib
export CPATH=/tmp/include
export LIBRARY_PATH=/tmp/lib
```

You can see an example of this working
[here](https://github.com/mhart/test-ci-project/commit/c29bfda8685910e6626a382fdc09662cc5d91359).

### PHP

[TODO](https://github.com/lambci/lambci/issues/10)

## Extending with ECS

LambCI can run tasks on an ECS cluster, which means you can perform all of your build tasks in a Docker container and not be subject to the same restrictions you have in the Lambda environment.

This needs to be documented further – for now you'll have to go [off the source]() and check out the [lambci/ecs](https://github.com/lambci/ecs) repo.

## Questions

### What does the Lambda function do?

  1. Receives notification from GitHub (via SNS)
  1. Looks up config in DynamoDB
  1. Clones git repo using a bundled git binary
  1. Looks up config files in repo
  1. Runs install and build cmds on Lambda (or starts ECS task)
  1. Updates Slack and GitHub statuses along the way (optionally SNS for email, etc)
  1. Uploads build logs/statuses to S3

### How do all the pieces fit together?

Something like this:

![Architecture diagram](https://lambci.s3.amazonaws.com/assets/arch.png)

### Why isn't my build triggering on large pushes?

Most GitHub events are relatively small – except in the case of branch pushes
that involve hundreds of files (pull request events are not affected). GitHub
keeps events it sends under the
[SNS limit of 256kb](http://docs.aws.amazon.com/sns/latest/dg/large-payload-raw-message.html)
by splitting up larger events, but because
[Lambda events are currently limited to 128kb](http://docs.aws.amazon.com/lambda/latest/dg/limits.html#limits-list)
([which will hopefully be fixed soon!](https://twitter.com/timallenwagner/status/747950793555247104)),
SNS will fail to deliver them to the Lambda function (and you'll receive an error in
your CloudWatch SNS failure logs).

If this happens, and LambCI isn't triggered by a push, then you can just create
a dummy commit and push that, which will result in a much smaller event:

```console
git commit --allow-empty -m 'Trigger LambCI'
git push
```


## License

MIT


