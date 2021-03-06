// @license
// Copyright (c) 2017 Google Inc. All rights reserved.
// This code may only be used under the BSD style license found at
// http://polymer.github.io/LICENSE.txt
// Code distributed by Google as part of this project is also
// subject to an additional IP rights grant found at
// http://polymer.github.io/PATENTS.txt
'use strict';

const Identifier = require('./identifier.js');
const Entity = require('./entity.js');
const Relation = require('./relation.js');
const Symbols = require('./symbols.js');
const underlyingView = require('./view.js');
let identifier = Symbols.identifier;
const assert = require("assert");

// TODO: This won't be needed once runtime is transferred between contexts.
function cloneData(data) {
  return data;
  //return JSON.parse(JSON.stringify(data));
}

function restore(entry, entityClass) {
  let {id, rawData} = entry;
  var entity = new entityClass(cloneData(rawData));

  // TODO some relation magic, somewhere, at some point.

  return entity;
}

class Viewlet {
  constructor(view) {
    this._view = view;
  }
  underlyingView() {
    return this._view;
  }
  on(kind, callback, target) {
    return this._view.on(kind, callback, target);
  }

  synchronize(kind, modelCallback, callback, target) {
    return this._view.synchronize(kind, modelCallback, callback, target);
  }

  generateID() {
    return this._view.generateID();
  }

  _serialize(entity) {
    if (!entity.isIdentified())
      entity.identify(this.generateID());
    let id = entity[identifier];
    let rawData = cloneData(entity.toLiteral());
    return {
      id,
      rawData
    };
  }

  _restore(entry) {
    assert(this.entityClass, "Viewlets need entity classes for deserialization");
    return restore(entry, this.entityClass);
  }

  get type() {
    return this._view._type;
  }
  get name() {
    return this._view.name;
  }

  get _id() {
    return this._view._id;
  }
}

class View extends Viewlet {
  constructor(view) {
    // TODO: this should talk to an API inside the PEC.
    super(view);
  }
  query() {
    // TODO: things
  }
  async toList() {
    // TODO: remove this and use query instead
    return (await this._view.toList()).map(a => this._restore(a));
  }
  store(entity) {
    var serialization = this._serialize(entity);
    return this._view.store(serialization);
  }
  async debugString() {
    var list = await this.toList();
    return list ? ('[' + list.map(p => p.debugString).join(", ") + ']') : 'undefined';
  }
}

class Variable extends Viewlet {
  constructor(variable) {
    super(variable);
  }
  async get() {
    var result = await this._view.get();
    var data = result == null ? undefined : this._restore(result);
    return data;
  }
  set(entity) {
    return this._view.set(this._serialize(entity));
  }
  clear() {
    this._view.clear();
  }
  async debugString() {
    var value = await this.get();
    return value ? value.debugString : 'undefined';
  }
}

function viewletFor(view, isView) {
  if (isView || (isView == undefined && view instanceof underlyingView.View))
    view = new View(view);
  else
    view = new Variable(view);
  return view;
}

module.exports = { viewletFor };
