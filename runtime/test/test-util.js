/**
 * @license
 * Copyright (c) 2017 Google Inc. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * Code distributed by Google as part of this project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */

 "use strict";

let assert = require('chai').assert;
let viewlet = require('../viewlet.js');

function assertSingletonHas(view, entityClass, expectation) {
  return new Promise((resolve, reject) => {
    var variable = viewlet.viewletFor(view);
    variable.entityClass = entityClass;
    variable.on('change', () => variable.get().then(result => {
      if (result == undefined)
        return;
      assert.equal(result.value, expectation);
      resolve();
    }), {});
  });
}

function assertViewHas(view, entityClass, field, expectations) {
  return new Promise((resolve, reject) => {
    view = viewlet.viewletFor(view, true);
    view.entityClass = entityClass;
    view.toList().then(result => {
      assert.deepEqual(result.map(a => a[field]), expectations);
      resolve();
    });
  });
}

function assertSingletonEmpty(view) {
  return new Promise((resolve, reject) => {
    var variable = new viewlet.viewletFor(view);
    variable.get().then(result => {
      assert.equal(result, undefined);
      resolve();
    });
  });
}

function initParticleSpec(name) {
  return {
    spec: {
      name,
    },
    exposeMap: new Map(),
    renderMap: new Map(),
  };
}

exports.assertSingletonHas = assertSingletonHas;
exports.assertSingletonEmpty = assertSingletonEmpty;
exports.assertViewHas = assertViewHas;
exports.initParticleSpec = initParticleSpec;
