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

var runtime = require("./runtime.js");
var assert = require("assert");
var tracing = require("tracelib");
const Type = require('./type.js');
const {View, Variable} = require('./view.js');
const Relation = require('./relation.js');
let viewlet = require('./viewlet.js');
const OuterPec = require('./outer-PEC.js');
const Recipe = require('./recipe/recipe.js');
const Manifest = require('./manifest.js');

class Arc {
  constructor({id, context, pecFactory, slotComposer}) {
    // TODO: context should not be optional.
    this._context = context || new Manifest();
    // TODO: pecFactory should not be optional. update all callers and fix here.
    this._pecFactory = pecFactory ||  require('./fake-pec-factory').bind(null);
    this.id = id;
    this._nextLocalID = 0;
    this._activeRecipe = new Recipe();

    // All the views, mapped by view ID
    this._viewsById = new Map();
    // .. and mapped by Type
    this._viewsByType = new Map();

    // information about last-seen-versions of views
    this._lastSeenVersion = new Map();

    this.particleViewMaps = new Map();
    let pecId = this.generateID();
    let innerPecPort = this._pecFactory(pecId);
    this.pec = new OuterPec(innerPecPort, slotComposer, `${pecId}:outer`);
    if (slotComposer) {
      slotComposer.pec = this.pec;
    }
    this.nextParticleHandle = 0;

    // Dictionary from each tag string to a list of views
    this._tags = {};
    // Map from each view to a list of tags.
    this._viewTags = new Map();

    this.availableSlotIds = new Set();
  }

  static deserialize({serialization, pecFactory, slotComposer, arcMap}) {
    var entityMap = {};
    var viewMap = {};
    serialization.entities.forEach(e => entityMap[e.id] = e);
    var arc = new Arc({id: serialization.id, slotComposer});
    for (var serializedView of serialization.views) {
      if (serializedView.arc) {
        var view = arcMap.get(serializedView.arc).findViewById(serializedView.id);
        arc.mapView(view);
      } else {
        // TODO add a separate deserialize constructor for view?
        var view = arc.createView(new Type(serializedView.type.tag, serializedView.type.data), serializedView.name, serializedView.id);
        view._version = serializedView.version;

        if (serializedView.sort == 'view') {
          var values = serializedView.values.map(a => entityMap[a]);
          values.forEach(v => view._items.set(v.id, v));
        } else {
          var value = entityMap[serializedView.value];
          view._stored = value;
        }
      }
      viewMap[view.id] = view;
      arc._lastSeenVersion.set(view.id, serializedView.version);
    }
    for (var serializedParticle of serialization.particles) {
      var particleHandle = arc._instantiateParticle(serializedParticle.name);
      for (var name in serializedParticle.views) {
        arc._connectParticleToView(particleHandle, serializedParticle, name, viewMap[serializedParticle.views[name]]);
      }
    }
    return arc;
  }

  get context() {
    return this._context;
  }

  loadedParticles() {
    return [...this.particleViewMaps.values()].map(({spec}) => spec);
  }

  _instantiateParticle(recipeParticle) {
    var handle = this.nextParticleHandle++;
    let viewMap = {spec: recipeParticle.spec, views: new Map()};
    this.particleViewMaps.set(handle, viewMap);

    for (let [name, connection] of Object.entries(recipeParticle.connections)) {
      let view = this.findViewById(connection.view.id);
      assert(view);
      this._connectParticleToView(handle, recipeParticle, name, view);
    }

    assert(viewMap.views.size == viewMap.spec.connectionMap.size, `Not all connections are resolved for {$particle}`);
    this.pec.instantiate(recipeParticle, viewMap.spec, viewMap.views, this._lastSeenVersion);
    return handle;
  }

  generateID() {
    return `${this.id}:${this._nextLocalID++}`;
  }

  get _views() {
    return [...this._viewsById.values()];
  }

  // Makes a copy of the arc used for speculative execution.
  cloneForSpeculativeExecution() {
    var arc = new Arc({id: this.generateID(), pecFactory: this._pecFactory, context: this.context});
    var viewMap = new Map();
    this._views.forEach(v => viewMap.set(v, v.clone()));
    this.particleViewMaps.forEach((value, key) => {
      arc.particleViewMaps.set(key, {
        spec: value.spec,
        views: new Map()
      });
      value.views.forEach(v => arc.particleViewMaps.get(key).views.set(v.name, v.clone()));
    });

    arc._activeRecipe.mergeInto(this._activeRecipe);

    for (let v of viewMap.values()) {
      // FIXME: Tags
      arc._registerView(v, []);
    }
    arc._viewMap = viewMap;
    return arc;
  }

  serialize() {
    var s = { views: [], particles: [], id: this.id };

    // 1. serialize entities
    var entities = new Set();
    for (var view of this._views)
      view.extractEntities(entities);

    s.entities = [...entities.values()];

    // 2. serialize views
    for (var view of this._views) {
      if (view._arc !== this) {
        view.serializeMappingRecord(s.views);
      } else {
        view.serialize(s.views);
      }
    }

    // 3. serialize particles
    for (var particle of this.particleViewMaps.values()) {
      if (particle.spec.transient)
        continue;
      var name = particle.spec.name;
      var serializedParticle = { name, views: {}};
      for (let [key, value] of particle.views) {
        serializedParticle.views[key] = value.id;
      }
      s.particles.push(serializedParticle);
    }
    return s;
  }

  instantiate(recipe) {
    assert(recipe.isResolved(), 'Cannot instantiate an unresolved recipe');
    let {views, particles, slots} = recipe.mergeInto(this._activeRecipe);
    for (let recipeView of views) {
      if (['copy', 'create'].includes(recipeView.fate)) {
        let view = this.createView(recipeView.type);
        if (recipeView._fate === "copy") {
          var copiedView = this.findViewById(recipeView.id);
          view.cloneFrom(copiedView);
        }
        recipeView.id = view.id;
        recipeView.fate = "use";
        // TODO: move the call to OuterPEC's DefineView to here
      }
      assert(this.findViewById(recipeView.id), `view '${recipeView.id}' was not found`);
    }

    particles.forEach(recipeParticle => this._instantiateParticle(recipeParticle));

    if (this.pec.slotComposer) {
      // TODO: pass slot-connections instead
      this.pec.slotComposer.initializeRecipe(particles);
    }
  }

  _connectParticleToView(particleHandle, particle, name, targetView) {
    // If speculatively executing then we need to translate the view
    // in the plan to its clone.
    if (this._viewMap) {
      targetView = this._viewMap.get(targetView) || targetView;
    }
    assert(targetView, "no target view provided");
    var viewMap = this.particleViewMaps.get(particleHandle);
    assert(viewMap.spec.connectionMap.get(name) !== undefined, "can't connect view to a view slot that doesn't exist");
    viewMap.views.set(name, targetView);
  }

  createView(type, name, id, tags) {
    tags = tags || [];
    assert(type instanceof Type, "can't createView with a type that isn't a Type");
    if (type.isRelation)
      type = Type.newView(type);
    let view;
    if (type.isView) {
      view = new View(type, this, name, id);
    } else {
      assert(type.isEntity, `Expected entity type, but... ${JSON.stringify(type.toLiteral())}`);
      view = new Variable(type, this, name, id);
    }
    this._registerView(view, tags);
    return view;
  }

  _registerView(view, tags) {
    this._viewsById.set(view.id, view);
    let byType = this._viewsByType.get(Arc._viewKey(view.type)) || [];
    byType.push(view);
    this._viewsByType.set(Arc._viewKey(view.type), byType);

    if (tags.length) {
      for (let tag of tags) {
        if (this._tags[tag] == undefined)
          this._tags[tag] = [];
        this._tags[tag].push(view);
      }
    }
    this._viewTags.set(view, new Set(tags));
  }

  // TODO: Don't use this, we should be testing the schemas for compatiblity
  //       instead of using just the name.
  static _viewKey(type) {
    if (type.isView) {
      return `list:${type.primitiveType().entitySchema.name}`;
    } else {
      assert(type.isEntity);
      return type.entitySchema.name;
    }
  }

  findViewsByType(type, options) {
    // TODO: use options (location, labels, etc.) somehow.
    var views = this._viewsByType.get(Arc._viewKey(type)) || [];
    if (options && options.tag) {
      views = views.filter(view => this._viewTags.get(view).has(options.tag));
    }
    return views;
  }

  findViewById(id) {
    let view = this._viewsById.get(id);
    if (view == null) {
      view = this._context.findViewById(id);
    }
    return view;
  }

  // TODO: Remove this.
  _viewFor(type) {
    let views = this.findViewsByType(type);
    if (views.length > 0) {
      return views[0];
    }

    return this.createView(type, "automatically created for _viewFor");
  }

  commit(entities) {
    let entityMap = new Map();
    for (let entity of entities) {
      entityMap.set(entity, this._viewFor(Type.newView(entity.constructor.type)));
    }
    for (let entity of entities) {
      if (entity instanceof Relation) {
        entity.entities.forEach(entity => entityMap.set(entity, this._viewFor(Type.newView(entity.constructor.type))));
      }
    }
    this.newCommit(entityMap);
  }

  newCommit(entityMap) {
    for (let [entity, view] of entityMap.entries()) {
      entity.identify(this.generateID());
    }
    for (let [entity, view] of entityMap.entries()) {
      new viewlet.viewletFor(view).store(entity);
    }
  }

  stop() {
    this.pec.stop();
  }
}

module.exports = Arc;
