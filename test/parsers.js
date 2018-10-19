var assert = require('chai').assert
var log = require('../utils/log')
var webhook = require('../sources/webhook')

log.raw = () => {}

describe('parsers', function() {

  describe('webhook', function() {

    it('should parse pull request opened events', function() {
      var webhookEvent = require('./fixtures/pullRequest.opened.json')
      var build = webhook.parseEvent(webhookEvent, 'pull_request')
      assert(build.event)
      delete build.event
      assert.deepEqual(build, {
        project: 'gh/mhart/test-ci-project',
        eventType: 'pull_request',
        repo: 'mhart/test-ci-project',
        isPrivate: false,
        isFork: true,
        branch: 'master',
        cloneRepo: 'lambci/test-ci-project',
        checkoutBranch: 'mhart-patch-3',
        commit: '910027af113350baefd6ea214f31b3ab1142da68',
        prNum: 4,
        user: 'mhart',
        comment: 'Create README.md',
        baseCommit: '874bd0134744298c79fe2ae85d27377ca756c4b5',
      })
    })

    it('should parse pull request synchronize events', function() {
      var webhookEvent = require('./fixtures/pullRequest.synchronize.json')
      var build = webhook.parseEvent(webhookEvent, 'pull_request')
      assert(build.event)
      delete build.event
      assert.deepEqual(build, {
        project: 'gh/mhart/test-ci-project',
        eventType: 'pull_request',
        repo: 'mhart/test-ci-project',
        isPrivate: false,
        isFork: false,
        branch: 'master',
        cloneRepo: 'mhart/test-ci-project',
        checkoutBranch: 'mhart-patch-1',
        commit: 'cb9a8bfea83f9c7d15a800e9aeafac2529cda3bd',
        prNum: 1,
        user: 'mhart',
        comment: 'Create README.md',
        baseCommit: '9b57dfcce59b12f6f34916b46292c71fb5e109d6',
      })
    })

    it('should parse push events', function() {
      var webhookEvent = require('./fixtures/push.force.json')
      var build = webhook.parseEvent(webhookEvent, 'push')
      assert(build.event)
      delete build.event
      assert.instanceOf(build.committers, Set)
      assert.deepEqual(Array.from(build.committers), ['mhart'])
      delete build.committers
      assert.deepEqual(build, {
        project: 'gh/mhart/test-ci-project',
        eventType: 'push',
        repo: 'mhart/test-ci-project',
        isPrivate: false,
        branch: 'mhart-patch-1',
        cloneRepo: 'mhart/test-ci-project',
        checkoutBranch: 'mhart-patch-1',
        commit: 'a0c794a979e29d44b7ef889c12d1703089f3e474',
        user: 'mhart',
        comment: 'Add failing test',
        baseCommit: 'f5c50fa625e096c82a2defd99d9860497f1ec20d',
      })
    })

    it('should parse delete events', function() {
      var webhookEvent = require('./fixtures/push.deleted.json')
      var build = webhook.parseEvent(webhookEvent, 'push')
      assert.equal(build.ignore, 'Branch some-new-branch was deleted')
    })

    it('should parse tag events', function() {
      var webhookEvent = require('./fixtures/push.tag.json')
      var build = webhook.parseEvent(webhookEvent, 'push')
      assert.equal(build.ignore, 'Ref does not match any branches: refs/tags/whatever')
    })

    it('should parse events if committers have no username', function() {
      var webhookEvent = require('./fixtures/push.force.json')
      var gitEvent = JSON.parse(webhookEvent.body)
      gitEvent.commits.concat(gitEvent.head_commit).forEach(commit => {
        delete commit.author.username
        delete commit.committer.username
      })
      webhookEvent.body = JSON.stringify(gitEvent)
      var build = webhook.parseEvent(webhookEvent, 'push')
      assert(build.event)
      delete build.event
      assert.instanceOf(build.committers, Set)
      assert.deepEqual(Array.from(build.committers), [])
      delete build.committers
      assert.deepEqual(build, {
        project: 'gh/mhart/test-ci-project',
        eventType: 'push',
        repo: 'mhart/test-ci-project',
        isPrivate: false,
        branch: 'mhart-patch-1',
        cloneRepo: 'mhart/test-ci-project',
        checkoutBranch: 'mhart-patch-1',
        commit: 'a0c794a979e29d44b7ef889c12d1703089f3e474',
        user: 'mhart',
        comment: 'Add failing test',
        baseCommit: 'f5c50fa625e096c82a2defd99d9860497f1ec20d',
      })
    })

  })

})
