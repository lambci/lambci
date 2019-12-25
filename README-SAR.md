# LambCI

*Serverless continuous integration*

![LambCI Logo](https://lambci.s3.amazonaws.com/assets/logo-48x48.png)

[![LambCI Build Status](https://lambci-public-buildresults-e3xwlufrwb3i.s3.amazonaws.com/gh/lambci/lambci/branches/master/2c03c00899d9b188a928a910320eacdc.svg)](https://lambci-public-buildresults-e3xwlufrwb3i.s3.amazonaws.com/gh/lambci/lambci/branches/master/8f82e6f4df48d23dead65035f625f5c0.html)

[![Gitter](https://img.shields.io/gitter/room/lambci/lambci.svg)](https://gitter.im/lambci/lambci)

---

Automate your testing and deployments with:

- 1000 concurrent builds out of the box (can request more)
- No maintenance of web servers, build servers or databases
- Zero cost when not in use (ie, [100% utilization](https://twitter.com/kannonboy/status/734799060440211456))
- Easy to integrate with the rest of your AWS resources

---

## What is it?

LambCI is a package you can upload to [AWS Lambda](https://aws.amazon.com/lambda/) that
gets triggered when you push new code or open pull requests on GitHub and runs your tests (in the Lambda environment itself) – in the same vein as Jenkins, Travis or CircleCI.

It integrates with Slack, and updates your Pull Request and other commit statuses on GitHub to let you know if you can merge safely.

![LambCI in action](https://lambci.s3.amazonaws.com/assets/demo.gif)

## Installed languages

* Node.js 12.x (including `npm`/`npx`)
* Python 3.6 (including `pip`)
* Gcc 7.2 (including `c++`)

## Supported languages

* Node.js (any version via [nave](https://github.com/isaacs/nave))
* Python (3.8.0, 3.7.4, 3.6.9)
* Java (OpenJDK 1.8.0)
* Go (any version)
* Ruby (2.7.0, 2.6.5, 2.5.7, 2.4.9, 2.3.8, 2.2.10, 2.1.10, 2.0.0-p648)
* PHP (7.3.13, 7.2.26, 7.1.33, 7.0.32, 5.6.38)

## Prerequisites

* An [Amazon AWS account](https://portal.aws.amazon.com/gp/aws/developer/registration/index.html)
* A GitHub OAuth token
* (optional) A Slack API token

## Current Limitations (due to the Lambda environment itself)

* No root access
* 500MB disk space
* 15 min max build time
* Bring-your-own-binaries – Lambda has a limited selection of installed software
* 3.0GB max memory
* Linux only

## Installation and configuration

See the [LambCI homepage](https://github.com/lambci/lambci) for details
