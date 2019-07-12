'use strict';

const EmberSourceAddon = require('./lib/index');

const MergeTrees = require('broccoli-merge-trees');
const Funnel = require('broccoli-funnel');
const concat = require('broccoli-concat');
const babelHelpers = require('./broccoli/babel-helpers');
const concatBundle = require('./lib/concat-bundle');
const testIndexHTML = require('./broccoli/test-index-html');
const testPolyfills = require('./broccoli/test-polyfills');
const toNamedAMD = require('./broccoli/to-named-amd');
const rollupPackage = require('./broccoli/rollup-package');
const toES5 = require('./broccoli/to-es5');
const debugMacros = require('./broccoli/debug-macros');
const testBabelPluginsTransform = require('./broccoli/transforms/test-babel-plugins');

const {
  routerES,
  loader,
  qunit,
  handlebarsES,
  rsvpES,
  simpleHTMLTokenizerES,
  backburnerES,
  dagES,
  routeRecognizerES,
  glimmerES,
  glimmerCompilerES,
  emberVersionES,
  emberLicense,
  getPackagesES,
} = require('./broccoli/packages');

const ENV = process.env.EMBER_ENV || 'development';
const SHOULD_ROLLUP = process.env.SHOULD_ROLLUP !== 'false';
const SHOULD_TRANSPILE = Boolean(process.env.SHOULD_TRANSPILE);

function transpileTree(tree, env) {
  let transpiled = debugMacros(tree, env);

  if (SHOULD_TRANSPILE || env === 'production') {
    transpiled = toES5(transpiled);
  }

  return toNamedAMD(transpiled);
}

EmberSourceAddon.transpileTree = tree => transpileTree(tree, ENV);

module.exports = function() {
  let packages = new MergeTrees([
    // dynamically generated packages
    emberVersionES(),
    emberLicense(),

    // packages/** (after typescript compilation)
    getPackagesES(),

    // externalized helpers
    babelHelpers(),
  ]);

  // Rollup
  if (SHOULD_ROLLUP) {
    packages = new MergeTrees([
      new Funnel(packages, {
        exclude: [
          '@ember/-internals/browser-environment/index.js',
          '@ember/-internals/browser-environment/lib/**',
          '@ember/-internals/container/index.js',
          '@ember/-internals/container/lib/**',
          '@ember/-internals/environment/index.js',
          '@ember/-internals/environment/lib/**',
          '@ember/-internals/glimmer/index.js',
          '@ember/-internals/glimmer/lib/**',
          '@ember/-internals/metal/index.js',
          '@ember/-internals/metal/lib/**',
          '@ember/-internals/utils/index.js',
          '@ember/-internals/utils/lib/**',
        ],
      }),
      rollupPackage(packages, '@ember/-internals/browser-environment'),
      rollupPackage(packages, '@ember/-internals/environment'),
      rollupPackage(packages, '@ember/-internals/glimmer'),
      rollupPackage(packages, '@ember/-internals/metal'),
      rollupPackage(packages, '@ember/-internals/utils'),
      rollupPackage(packages, '@ember/-internals/container'),
    ]);
  }

  let dist = new MergeTrees([
    new Funnel(packages, {
      destDir: 'packages',
      exclude: [
        '**/package.json',
        '@ember/-internals/*/tests/**' /* internal packages */,
        '*/*/tests/**' /* scoped packages */,
        '*/tests/**' /* packages */,
        'ember-template-compiler/**',
        'internal-test-helpers/**',
      ],
    }),
    new Funnel(emberDependencies(ENV), { destDir: 'dependencies' }),
  ]);

  let finalBuild = new Funnel(EmberSourceAddon.treeForVendor(dist), {
    srcDir: 'ember',
  });

  let emberBundle = new Funnel(finalBuild, { include: ['ember.js', 'ember.map'] });
  let emberBundleWithLoader = concat(new MergeTrees([emberBundle, loader()]), {
    outputFile: 'ember.js',
    headerFiles: ['loader.js'],
    inputFiles: ['**/*.js'],
    sourceMapConfig: { enabled: true },
  });

  return new MergeTrees(
    [
      // Distributed files
      dist,
      templateCompilerBundle(packages, ENV),

      // Test builds
      finalBuild,
      emberBundleWithLoader,

      // Tests and test harness
      testsBundle(packages, ENV),
      testHarness(),
    ],
    {
      overwrite: true,
    }
  );
};

function emberDependencies(environment) {
  // generate "loose" ES<latest> modules...
  return new MergeTrees([
    backburnerES(),
    rsvpES(),
    dagES(),
    routerES(),
    routeRecognizerES(),
    glimmerES(environment),
  ]);
}

function testsBundle(emberPackages, env) {
  let exclude = env === 'production' ? ['@ember/debug/tests/**', 'ember-testing/tests/**'] : [];

  let emberTestsFiles = new MergeTrees([
    new Funnel(emberPackages, {
      include: [
        'internal-test-helpers/**',
        '@ember/-internals/*/tests/**' /* internal packages */,
        '*/*/tests/**' /* scoped packages */,
        '*/tests/**' /* packages */,
      ],
      exclude,
    }),
  ]);

  if (SHOULD_TRANSPILE || env === 'production') {
    emberTestsFiles = testBabelPluginsTransform(emberTestsFiles);
  }

  return concatBundle(transpileTree(emberTestsFiles, env), { outputFile: 'ember-tests.js' });
}

function templateCompilerBundle(emberPackages, env) {
  let templateCompilerDependencies = new MergeTrees([
    simpleHTMLTokenizerES(),
    handlebarsES(),
    glimmerCompilerES(),
  ]);

  let templateCompilerFiles = transpileTree(
    new MergeTrees([
      new Funnel(emberPackages, {
        include: [
          '@ember/-internals/utils/**',
          '@ember/-internals/environment/**',
          '@ember/-internals/browser-environment/**',
          '@ember/canary-features/**',
          '@ember/debug/**',
          '@ember/deprecated-features/**',
          '@ember/error/**',
          '@ember/polyfills/**',
          'ember/version.js',
          'ember-babel.js',
          'ember-template-compiler/**',
          'node-module/**',
          'license.txt',
        ],
        exclude: [
          '@ember/-internals/*/tests/**' /* internal packages */,
          '*/*/tests/**' /* scoped packages */,
          '*/tests/**' /* packages */,
        ],
      }),
      templateCompilerDependencies,
    ]),
    env
  );

  return concatBundle(new MergeTrees([templateCompilerFiles, loader()]), {
    outputFile: 'ember-template-compiler.js',
    headerFiles: ['license.txt', 'loader.js'],
    footer:
      '(function (m) { if (typeof module === "object" && module.exports) { module.exports = m } }(require("ember-template-compiler")));',
  });
}

function testHarness() {
  return new MergeTrees([emptyTestem(), testPolyfills(), testIndexHTML(), qunit()]);
}

function emptyTestem() {
  return new Funnel('tests', {
    files: ['testem.js'],
    destDir: '',
    annotation: 'tests/testem.js',
  });
}
