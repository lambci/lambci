var assert = require('chai').assert
var log = require('../utils/log')
var sns = require('../sources/sns')

log.raw = () => {}

describe('parsers', function() {

  describe('sns', function() {

    it('should parse pull request opened events', function() {
      var snsEvent = require('./fixtures/pullRequest.opened.json').Records[0].Sns
      var build = sns.parseEvent(snsEvent)
      assert(build.event)
      assert(build.startedAt)
      assert(build.statusEmitter)
      delete build.event
      delete build.startedAt
      delete build.statusEmitter
      assert.deepEqual(build, {
        project: 'gh/mhart/test-ci-project',
        eventType: 'pull_request',
        trigger: 'pr/4',
        repo: 'mhart/test-ci-project',
        isPrivate: false,
        isFork: true,
        branch: 'master',
        cloneRepo: 'lambci/test-ci-project',
        checkoutBranch: 'mhart-patch-3',
        commit: '910027af113350baefd6ea214f31b3ab1142da68',
        prNum: 4,
        user: 'mhart',
        status: 'pending',
        comment: 'Create README.md',
        baseCommit: '874bd0134744298c79fe2ae85d27377ca756c4b5',
        buildNum: 0,
        ignore: false,
        committers: null,
      })
    })

    it('should parse pull request synchronize events', function() {
      var snsEvent = require('./fixtures/pullRequest.synchronize.json').Records[0].Sns
      var build = sns.parseEvent(snsEvent)
      assert(build.event)
      assert(build.startedAt)
      assert(build.statusEmitter)
      delete build.event
      delete build.startedAt
      delete build.statusEmitter
      assert.deepEqual(build, {
        project: 'gh/mhart/test-ci-project',
        eventType: 'pull_request',
        trigger: 'pr/1',
        repo: 'mhart/test-ci-project',
        isPrivate: false,
        isFork: false,
        branch: 'master',
        cloneRepo: 'mhart/test-ci-project',
        checkoutBranch: 'mhart-patch-1',
        commit: 'cb9a8bfea83f9c7d15a800e9aeafac2529cda3bd',
        prNum: 1,
        user: 'mhart',
        status: 'pending',
        comment: 'Create README.md',
        baseCommit: '9b57dfcce59b12f6f34916b46292c71fb5e109d6',
        buildNum: 0,
        ignore: false,
        committers: null,
      })
    })

    it('should parse push events', function() {
      var snsEvent = require('./fixtures/push.force.json').Records[0].Sns
      var build = sns.parseEvent(snsEvent)
      assert(build.event)
      assert(build.startedAt)
      assert(build.statusEmitter)
      delete build.event
      delete build.startedAt
      delete build.statusEmitter
      assert.deepEqual(build, {
        project: 'gh/mhart/test-ci-project',
        eventType: 'push',
        trigger: 'push/mhart-patch-1',
        repo: 'mhart/test-ci-project',
        isPrivate: false,
        isFork: false,
        branch: 'mhart-patch-1',
        cloneRepo: 'mhart/test-ci-project',
        checkoutBranch: 'mhart-patch-1',
        commit: '630a79d3395a839a48fada5079ac1cd2e4391c9e',
        prNum: 0,
        user: 'mhart',
        status: 'pending',
        comment: 'Create README.md',
        baseCommit: '76b5774dfde78b14011c8fd880dcb0e389e82e03',
        buildNum: 0,
        ignore: false,
        committers: {
          'michael.hart.au@gmail.com': 'mhart',
        },
      })
    })

    it('should parse delete events', function() {
      var snsEvent = require('./fixtures/push.deleted.json').Records[0].Sns
      var build = sns.parseEvent(snsEvent)
      assert.equal(build.ignore, 'Branch some-new-branch was deleted')
    })

  })

})
