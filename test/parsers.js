var assert = require('chai').assert
var log = require('../utils/log')
var sns = require('../sources/sns')

log.raw = () => {}

describe('parsers', function() {

  describe('sns', function() {

    it('should parse pull request opened events', function() {
      var snsEvent = require('./fixtures/pullRequest.opened.json').Records[0].Sns
      var build = sns.parseEvent(snsEvent)
      assert.equal(build.project, 'gh/mhart/test-ci-project')
      assert.equal(build.eventType, 'pull_request')
      assert.equal(build.eventContext, 'pr/4')
      assert.equal(build.repo, 'mhart/test-ci-project')
      assert.equal(build.isPrivate, false)
      assert.equal(build.isFork, true)
      assert.equal(build.branch, 'master')
      assert.equal(build.cloneUrl, 'https://github.com/lambci/test-ci-project.git')
      assert.equal(build.checkoutBranch, 'mhart-patch-3')
      assert.equal(build.commit, '910027af113350baefd6ea214f31b3ab1142da68')
      assert.equal(build.prNum, 4)
      assert.isNotOk(build.ignore)
    })

    it('should parse pull request synchronize events', function() {
      var snsEvent = require('./fixtures/pullRequest.synchronize.json').Records[0].Sns
      var build = sns.parseEvent(snsEvent)
      assert.equal(build.project, 'gh/mhart/test-ci-project')
      assert.equal(build.eventType, 'pull_request')
      assert.equal(build.eventContext, 'pr/1')
      assert.equal(build.repo, 'mhart/test-ci-project')
      assert.equal(build.isPrivate, false)
      assert.equal(build.isFork, false)
      assert.equal(build.branch, 'master')
      assert.equal(build.cloneUrl, 'https://github.com/mhart/test-ci-project.git')
      assert.equal(build.checkoutBranch, 'mhart-patch-1')
      assert.equal(build.commit, 'cb9a8bfea83f9c7d15a800e9aeafac2529cda3bd')
      assert.equal(build.prNum, 1)
      assert.isNotOk(build.ignore)
    })

    it('should parse push events', function() {
      var snsEvent = require('./fixtures/push.force.json').Records[0].Sns
      var build = sns.parseEvent(snsEvent)
      assert.equal(build.project, 'gh/mhart/test-ci-project')
      assert.equal(build.eventType, 'push')
      assert.equal(build.eventContext, 'push/mhart-patch-1')
      assert.equal(build.repo, 'mhart/test-ci-project')
      assert.equal(build.isPrivate, false)
      assert.equal(build.isFork, false)
      assert.equal(build.branch, 'mhart-patch-1')
      assert.equal(build.cloneUrl, 'https://github.com/mhart/test-ci-project.git')
      assert.equal(build.checkoutBranch, 'mhart-patch-1')
      assert.equal(build.commit, '630a79d3395a839a48fada5079ac1cd2e4391c9e')
      assert.isNotOk(build.ignore)
    })

    it('should parse delete events', function() {
      var snsEvent = require('./fixtures/push.deleted.json').Records[0].Sns
      var build = sns.parseEvent(snsEvent)
      assert.equal(build.ignore, 'Branch some-new-branch was deleted')
    })

  })

})
