var assert = require('chai').assert
var log = require('../utils/log')
var sns = require('../sources/sns')

log.raw = () => {}

describe('parsers', function() {

  describe('sns', function() {

    it('should parse pull request opened events', function() {
      var snsEvent = require('./fixtures/pullRequest.opened.json').Records[0].Sns
      sns.parseEvent(snsEvent, (err, build) => {
        assert(!err)
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
          prState: 'open',
          user: 'mhart',
          comment: 'Create README.md',
          baseCommit: '874bd0134744298c79fe2ae85d27377ca756c4b5',
        })
      })
    })

    it('should parse pull request synchronize events', function() {
      var snsEvent = require('./fixtures/pullRequest.synchronize.json').Records[0].Sns
      sns.parseEvent(snsEvent, (err, build) => {
        assert(!err)
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
          prState: 'open',
          user: 'mhart',
          comment: 'Create README.md',
          baseCommit: '9b57dfcce59b12f6f34916b46292c71fb5e109d6',
        })
      })
    })

    it('should parse push events', function() {
      var snsEvent = require('./fixtures/push.force.json').Records[0].Sns
      sns.parseEvent(snsEvent, (err, build) => {
        assert(!err)
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
    })

    it('should parse delete events', function() {
      var snsEvent = require('./fixtures/push.deleted.json').Records[0].Sns
      sns.parseEvent(snsEvent, (err, build) => {
        assert(!err)
        assert.equal(build.ignore, 'Branch some-new-branch was deleted')
      })
    })

    it('should parse tag events', function() {
      var snsEvent = require('./fixtures/push.tag.json').Records[0].Sns
      sns.parseEvent(snsEvent, (err, build) => {
        assert(!err)
        assert.equal(build.ignore, 'Ref does not match any branches: refs/tags/whatever')
      })
    })

    it('should parse events if committers have no username', function() {
      var snsEvent = require('./fixtures/push.force.json').Records[0].Sns
      var gitEvent = JSON.parse(snsEvent.Message)
      gitEvent.commits.concat(gitEvent.head_commit).forEach(commit => {
        delete commit.author.username
        delete commit.committer.username
      })
      snsEvent.Message = JSON.stringify(gitEvent)
      sns.parseEvent(snsEvent, (err, build) => {
        assert(!err)
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

})
