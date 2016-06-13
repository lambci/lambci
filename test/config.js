var assert = require('chai').assert
var configUtils = require('../utils/config')

describe('config', function() {

  describe('default', function() {

    it('should build master', function() {
      var build = {eventType: 'push', branch: 'master'}
      var config = configUtils.initConfig(null, build)
      assert.equal(config.build, true)
    })

    it('should not build other branches', function() {
      var build = {eventType: 'push', branch: 'anything'}
      var config = configUtils.initConfig(null, build)
      assert.equal(config.build, false)
    })

    it('should build pull requests from self if private', function() {
      var build = {eventType: 'pull_request', isFork: false, isPrivate: true}
      var config = configUtils.initConfig(null, build)
      assert.equal(config.build, true)
      assert.equal(config.inheritSecrets, true)
      assert.equal(config.allowConfigOverrides, true)
    })

    it('should build pull requests from self if public', function() {
      var build = {eventType: 'pull_request', isFork: false, isPrivate: false}
      var config = configUtils.initConfig(null, build)
      assert.equal(config.build, true)
      assert.equal(config.inheritSecrets, true)
      assert.equal(config.allowConfigOverrides, true)
    })

    it('should not build pull requests from fork if private', function() {
      var build = {eventType: 'pull_request', isFork: true, isPrivate: true}
      var config = configUtils.initConfig(null, build)
      assert.equal(config.build, false)
    })

    it('should build pull requests from fork if public with restrictions', function() {
      var build = {eventType: 'pull_request', isFork: true, isPrivate: false}
      var config = configUtils.initConfig(null, build)
      assert.equal(config.build, true)
      assert.equal(config.inheritSecrets, false)
      assert.deepEqual(config.allowConfigOverrides, ['cmd', 'env'])
    })

  })

  describe('branch regexes', function() {

    it('should match simple regex', function() {
      var build = {eventType: 'push', branch: 'test-something'}
      var customConfig = {
        branches: {
          '/^test-/': true,
        },
      }
      var config = configUtils.initConfig([customConfig], build)
      assert.equal(config.build, true)
    })

    it('should match exact match before regex', function() {
      var build = {eventType: 'push', branch: 'test-something'}
      var customConfig = {
        branches: {
          '/^test-/': true,
          'test-something': false,
        },
      }
      var config = configUtils.initConfig([customConfig], build)
      assert.equal(config.build, false)
    })

    it('should match negative regex', function() {
      var build = {eventType: 'push', branch: 'test-something'}
      var customConfig = {
        branches: {
          '!/^test-/': true,
        },
      }
      var config = configUtils.initConfig([customConfig], build)
      assert.equal(config.build, false)

      build = {eventType: 'push', branch: 'hello'}
      config = configUtils.initConfig([customConfig], build)
      assert.equal(config.build, true)
    })

    it('should match regexes in order', function() {
      var build = {eventType: 'push', branch: 'test-something'}
      var customConfig = {
        branches: {
          '/^test-r/': false,
          '/^test-s/': true,
        },
      }
      var config = configUtils.initConfig([customConfig], build)
      assert.equal(config.build, true)
    })

  })

  describe('files', function() {

    it('should load from .lambci.js if overrides and secrets are allowed', function() {
      var configDir = `${__dirname}/fixtures/config1`
      var build = {eventType: 'push', branch: 'test-something', cloneDir: configDir}
      var baseConfig = {
        allowConfigOverrides: true,
        inheritSecrets: true,
      }
      var config = configUtils.resolveFileConfigs(baseConfig, build)
      assert.deepEqual(config, {
        cmd: 'from .lambci.js',
        env: {SOURCE: '.lambci.js'},
        notifications: {slack: {channel: '#packagejson'}},
        allowConfigOverrides: true,
        inheritSecrets: true,
      })
    })

    it('should load from .lambci.json if overrides but not secrets are allowed', function() {
      var configDir = `${__dirname}/fixtures/config1`
      var build = {eventType: 'push', branch: 'test-something', cloneDir: configDir}
      var baseConfig = {
        allowConfigOverrides: true,
        inheritSecrets: false,
      }
      var config = configUtils.resolveFileConfigs(baseConfig, build)
      assert.deepEqual(config, {
        cmd: 'from .lambci.json',
        env: {SOURCE: '.lambci.json'},
        notifications: {slack: {channel: '#packagejson'}},
        allowConfigOverrides: true,
        inheritSecrets: false,
      })
    })

    it('should not load anything if no overrides are allowed', function() {
      var configDir = `${__dirname}/fixtures/config1`
      var build = {eventType: 'push', branch: 'test-something', cloneDir: configDir}
      var baseConfig = {
        allowConfigOverrides: false,
      }
      var config = configUtils.resolveFileConfigs(baseConfig, build)
      assert.deepEqual(config, baseConfig)
    })

    it('should load from package.json if no .lambci.json and no inherits', function() {
      var configDir = `${__dirname}/fixtures/config2`
      var build = {eventType: 'push', branch: 'test-something', cloneDir: configDir}
      var baseConfig = {
        allowConfigOverrides: true,
        inheritSecrets: false,
      }
      var config = configUtils.resolveFileConfigs(baseConfig, build)
      assert.deepEqual(config, {
        cmd: 'from package.json',
        notifications: {slack: {channel: '#packagejson'}},
        allowConfigOverrides: true,
        inheritSecrets: false,
      })
    })

    it('should load from package.json if no .lambci.json with inherits', function() {
      var configDir = `${__dirname}/fixtures/config2`
      var build = {eventType: 'push', branch: 'test-something', cloneDir: configDir}
      var baseConfig = {
        allowConfigOverrides: true,
        inheritSecrets: true,
      }
      var config = configUtils.resolveFileConfigs(baseConfig, build)
      assert.deepEqual(config, {
        cmd: 'from .lambci.js',
        env: {SOURCE: '.lambci.js'},
        notifications: {slack: {channel: '#packagejson'}},
        allowConfigOverrides: true,
        inheritSecrets: true,
      })
    })

  })

  describe('secret env', function() {

    it('should inherit env vars if allowed', function() {
      var config = {
        env: {
          HOME: '/tmp/home',
        },
        secretEnv: {
          AWS_ACCESS_KEY_ID: 'abcd',
          AWS_SECRET_ACCESS_KEY: 'efgh',
        },
        inheritSecrets: true,
      }
      var env = configUtils.resolveEnv(config)
      assert.deepEqual(env, {
        HOME: '/tmp/home',
        AWS_ACCESS_KEY_ID: 'abcd',
        AWS_SECRET_ACCESS_KEY: 'efgh',
      })
    })

    it('should override env vars if allowed', function() {
      var config = {
        env: {
          HOME: '/tmp/home',
        },
        secretEnv: {
          HOME: '/tmp/secret',
          AWS_ACCESS_KEY_ID: 'abcd',
          AWS_SECRET_ACCESS_KEY: 'efgh',
        },
        inheritSecrets: true,
      }
      var env = configUtils.resolveEnv(config)
      assert.deepEqual(env, {
        HOME: '/tmp/secret',
        AWS_ACCESS_KEY_ID: 'abcd',
        AWS_SECRET_ACCESS_KEY: 'efgh',
      })
    })

    it('should not inherit env vars if not allowed', function() {
      var config = {
        env: {
          HOME: '/tmp/home',
        },
        secretEnv: {
          AWS_ACCESS_KEY_ID: 'abcd',
          AWS_SECRET_ACCESS_KEY: 'efgh',
        },
        inheritSecrets: false,
      }
      var env = configUtils.resolveEnv(config)
      assert.deepEqual(env, {
        HOME: '/tmp/home',
      })
    })

    it('should be ok with missing secretEnv if not allowed', function() {
      var config = {
        env: {
          HOME: '/tmp/home',
        },
        inheritSecrets: false,
      }
      var env = configUtils.resolveEnv(config)
      assert.deepEqual(env, {
        HOME: '/tmp/home',
      })
    })

    it('should be ok with missing secretEnv if allowed', function() {
      var config = {
        env: {
          HOME: '/tmp/home',
        },
        inheritSecrets: true,
      }
      var env = configUtils.resolveEnv(config)
      assert.deepEqual(env, {
        HOME: '/tmp/home',
      })
    })

    it('should be ok with empty secretEnv if not allowed', function() {
      var config = {
        env: {
          HOME: '/tmp/home',
        },
        secretEnv: {},
        inheritSecrets: false,
      }
      var env = configUtils.resolveEnv(config)
      assert.deepEqual(env, {
        HOME: '/tmp/home',
      })
    })

    it('should be ok with empty secretEnv if allowed', function() {
      var config = {
        env: {
          HOME: '/tmp/home',
        },
        secretEnv: {},
        inheritSecrets: true,
      }
      var env = configUtils.resolveEnv(config)
      assert.deepEqual(env, {
        HOME: '/tmp/home',
      })
    })

  })


})
