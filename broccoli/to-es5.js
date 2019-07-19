'use strict';

const Babel = require('broccoli-babel-transpiler');
const injectBabelHelpers = require('./transforms/inject-babel-helpers');
const buildStripClassCallcheckPlugin = require('../lib/build-strip-class-callcheck-plugin');

module.exports = function toES5(tree, _options) {
  let options = Object.assign({}, _options);

  options.sourceMaps = true;
  options.plugins = [
    injectBabelHelpers,
    ['@babel/transform-template-literals', { loose: true }],
    ['@babel/transform-literals'],
    ['@babel/transform-arrow-functions'],
    ['@babel/transform-destructuring', { loose: true }],
    ['@babel/transform-spread', { loose: true }],
    ['@babel/transform-parameters'],
    ['@babel/transform-computed-properties', { loose: true }],
    ['@babel/transform-shorthand-properties'],
    ['@babel/transform-block-scoping', { throwIfClosureRequired: true }],
    ['@babel/transform-classes', { loose: true }],
    ['@babel/transform-object-assign'],
    buildStripClassCallcheckPlugin(),
  ];

  if (options.inlineHelpers) {
    options.plugins.shift();
    delete options.inlineHelpers;
  }

  return new Babel(tree, options);
};
