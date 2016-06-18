var assert = require('chai').assert
var utils = require('../utils')

describe('utils', function() {

  describe('semverCmp', function() {

    it('should sort semvers correctly', function() {
      var versions = [
        '1.2.3',
        '1.2.3-alpha',
        '1.0.0-x.7.z.92',
        '1.0.0-alpha.1',
        '1.0.0-alpha',
        '4.11.6',
        '4.2.0',
        '1.5.19',
        '1.5.5',
        '4.1.3',
        '2.3.1',
        '10.5.5',
        '11.3.0',
        '1.0.0',
        '1.0.0-rc.1',
        '1.0.0-beta.11',
        '1.0.0-beta',
        '1.0.0-beta.2',
        '1.0.0-alpha.beta',
        '1.0.0-alpha.1',
        '1.0.0-alpha',
      ]
      var sorted = versions.sort(utils.semverCmp)
      assert.deepEqual(sorted, [
        '1.0.0-alpha',
        '1.0.0-alpha',
        '1.0.0-alpha.1',
        '1.0.0-alpha.1',
        '1.0.0-alpha.beta',
        '1.0.0-beta',
        '1.0.0-beta.2',
        '1.0.0-beta.11',
        '1.0.0-rc.1',
        '1.0.0-x.7.z.92',
        '1.0.0',
        '1.2.3-alpha',
        '1.2.3',
        '1.5.5',
        '1.5.19',
        '2.3.1',
        '4.1.3',
        '4.2.0',
        '4.11.6',
        '10.5.5',
        '11.3.0',
      ])
    })

    it('should ignore build metadata', function() {
      assert.equal(utils.semverCmp('1.0.0-alpha+001', '1.0.0-alpha'), 0)
      assert.equal(utils.semverCmp('1.0.0-alpha+001', '1.0.0-alpha+asd.asdf.afsd'), 0)
      assert.equal(utils.semverCmp('1.0.0+20130313144700', '1.0.0'), 0)
      assert.equal(utils.semverCmp('1.0.0+20130313144700', '1.0.0+fas.fds'), 0)
      assert.equal(utils.semverCmp('1.0.0-beta+exp.sha.5114f85', '1.0.0-beta'), 0)
      assert.equal(utils.semverCmp('1.0.0-beta+exp.sha.5114f85', '1.0.0-beta+sha.5114f85'), 0)
    })

  })

})
