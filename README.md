<img align="left" src="https://lambci.s3.amazonaws.com/assets/logo-310x310.png" width="180px" height="180px">

# LambCI

*Serverless continuous integration*

[![Launch CloudFormation Stack](https://s3.amazonaws.com/cloudformation-examples/cloudformation-launch-stack.png)](https://console.aws.amazon.com/cloudformation/home?region=us-east-1#/stacks/new?stackName=lambci&templateURL=https://lambci.s3.amazonaws.com/templates/lambci.template)
[![Gitter](https://img.shields.io/gitter/room/lambci/lambci.svg)](https://gitter.im/lambci/lambci)


---

Automate your testing and deployments with:

- 100 concurrent builds out of the box (can request more)
- No maintenance of web servers, build servers or databases
- Zero cost when not in use (ie, [100% utilization](https://twitter.com/kannonboy/status/734799060440211456))
- Easy to integrate with the rest of your AWS stack (if you have one!)

---

## What is it?

A package you can upload to [AWS Lambda](https://aws.amazon.com/lambda/) that runs your tests (in the Lambda environment itself) whenever you push new code or open pull requests on GitHub  – in the same vein as Jenkins, Travis or CircleCI.

Easily launched (and kept up-to-date) as a [CloudFormation Stack](https://aws.amazon.com/cloudformation/), or you can manually create the different resources yourself.

(Support for running under [Google Cloud Functions](https://cloud.google.com/functions/) may be added in the near future, depending on the API they settle on)


## Supported languages

* Node.js (multiple versions via [nave](https://github.com/isaacs/nave), no native compilation as yet)
* Python 2.7 (no native compilation as yet)
* Go (any version – can manually bootstrap)
* Java 7/8 (JREs are installed, but no SDKs, so... tricky... needs research)
* Other statically compiled languages should work, unless they rely on a linker+headers – so Rust is currently out

## Prerequisites

* An [Amazon AWS account](https://portal.aws.amazon.com/gp/aws/developer/registration/index.html)
* A GitHub API token (see below)
* (optional) A Slack API token (see below)

## Current Limitations (due to the Lambda environment itself)

* Linux only builds
* No root access
* Bring-your-own-binaries – Lambda has a limited selection of installed software
* 5 min max build time (strategies to split builds up)
* 1.5GB max memory
* Event size limit bug (see below)

Most GitHub events are relatively small – except in the case of branch pushes
that involve hundreds of files (pull request events are not affected). GitHub
keeps events it sends under the *SNS limit of 256kb* by splitting up larger
events, but because *Lambda events are currently limited to 128kb*
([which will hopefully be fixed soon!](https://twitter.com/timallenwagner/status/747950793555247104)),
SNS will fail to deliver them to the Lambda function (and you'll receive an error in
your CloudWatch SNS failure logs).

If this happens, and LambCI isn't triggered by a push, then you can just create
a dummy commit and push that, which will result in a much smaller event:

    git commit --allow-empty -m 'Trigger LambCI'
    git push

## What does the Lambda function do?

  1. Receives notification from GitHub (via SNS)
  1. Looks up config in DynamoDB
  1. Clones git repo using a bundled git binary
  1. Looks up config files in repo
  1. Runs install and build cmds on Lambda (or starts ECS task)
  1. Updates Slack and GitHub statuses along the way (optionally SNS for email, etc)
  1. Uploads build logs/statuses to S3

## Recipes

    nave use 6 bash -c 'npm install && npm test'

    "ci": "run-p ci:*",
    "ci:node4": "nave use 4 npm test",
    "ci:node5": "nave use 5 npm test",
    "ci:node6": "nave use 6 npm test"

### Go

The go toolchain is too big to include in the Lambda package, but it's very easy (and quick) to install as part of your build – and if your Lambda process stays warm, then you won't need to install it again. Just add something like this before your build/test commands:

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

### Rust

This is a work in progress – the commands below will install rustc, cargo and rustup, which work up to a point – but rust relies on a working `cc` installation, which is still a TODO (see Clang below)

```bash
#!/bin/bash -ex

export CARGO_HOME=$HOME/.cargo
export MULTIRUST_HOME=$HOME/.multirust
export RUSTUP_HOME=$HOME/.multirust/rustup

curl https://sh.rustup.rs -sSf | sh -s -- -y

export PATH=$HOME/.cargo/bin:$PATH
rustc --version
cargo --version
```
(`cargo build --verbose` works, but `cargo test --verbose` won't because there's no `cc`)

### Clang

The CentOS 6 version of clang seems to install fine – but getting the various development headers and libraries (stdio.h, etc) is still a work in progress. It *should* be easier than getting a full gcc installation working though.

```
#!/bin/bash -ex

curl -sSL http://llvm.org/releases/3.8.0/clang+llvm-3.8.0-linux-x86_64-centos6.tar.xz | tar -C $HOME -xJ
export CC=$HOME/clang+llvm-3.8.0-linux-x86_64-centos6/bin/clang
export CXX=$HOME/clang+llvm-3.8.0-linux-x86_64-centos6/bin/clang++
export PATH=$HOME/clang+llvm-3.8.0-linux-x86_64-centos6/bin:$PATH
clang --version
```

## License

MIT
