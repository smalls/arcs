// Copyright (c) 2017 Google Inc. All rights reserved.
// This code may only be used under the BSD style license found at
// http://polymer.github.io/LICENSE.txt
// Code distributed by Google as part of this project is also
// subject to an additional IP rights grant found at
// http://polymer.github.io/PATENTS.txt

const assert = require('assert');

class Strategizer {
  constructor(strategies, evaluators, {maxPopulation, generationSize, discardSize}) {
    this._strategies = strategies;
    this._evaluators = evaluators;
    this._generation = 0;
    this._internalPopulation = [];
    this._population = [];
    this._generated = [];
    this._options = {
      maxPopulation,
      generationSize,
      discardSize,
    };
    this.populationHash = new Map();
  }
  // Latest generation number.
  get generation() {
    return this._generation;
  }
  // All individuals in the current population.
  get population() {
    return this._population;
  }
  // Individuals of the latest generation.
  get generated() {
    return this._generated;
  }
  // Individuals that were discarded in the latest generation.
  get discarded() {
    return this._discarded;
    // TODO: Do we need this?
  }
  async generate() {
    // Generate
    let generation = this.generation + 1;
    let individualsPerStrategy = Math.floor(this._options.generationSize / this._strategies.length);
    let generated = await Promise.all(this._strategies.map(strategy => {
      return strategy.generate(this, individualsPerStrategy);
    }));

    var record = {};
    record.generation = generation;
    record.sizeOfLastGeneration = this.generated.length;
    record.outputSizesOfStrategies = {};
    for (var i = 0; i < this._strategies.length; i++) {
      record.outputSizesOfStrategies[this._strategies[i].constructor.name] = generated[i].results.length;
    }

    generated = generated.map(({results}) => results);
    generated = [].concat(...generated);

    // TODO: get rid of this additional asynchrony
    generated = await Promise.all(generated.map(async result => {
      if (result.hash) result.hash = await result.hash;
      return result;
    }));

    record.rawGenerated = generated.length;
    record.nullDerivations = 0;
    record.invalidDerivations = 0;
    record.duplicateDerivations = 0;
    record.nullDerivationsByStrategy = {};
    record.duplicateDerivationsByStrategy = {};
    record.invalidDerivationsByStrategy = {};

    generated = generated.filter(result => {
      if (result.hash) {
        var existingResult = this.populationHash.get(result.hash);
        var strategy = result.derivation[0].strategy.constructor.name;
        if (existingResult) {
          if (result.derivation[0].parent == existingResult) {
            record.nullDerivations += 1;
            if (record.nullDerivationsByStrategy[strategy] == undefined)
              record.nullDerivationsByStrategy[strategy] = 0;
            record.nullDerivationsByStrategy[strategy]++;
          } else if (existingResult.derivation.map(a => a.parent).indexOf(result.derivation[0].parent) != -1) {
            record.duplicateDerivations += 1;
            if (record.duplicateDerivationsByStrategy[strategy] == undefined)
              record.duplicateDerivationsByStrategy[strategy] = 0;
            record.duplicateDerivationsByStrategy[strategy]++;
          } else {
            this.populationHash.get(result.hash).derivation.push(result.derivation[0]);
          }
          return false;
        }
        this.populationHash.set(result.hash, result);
      }
      if (result.valid === false) {
        record.invalidDerivations++;
        record.invalidDerivationsByStrategy[strategy] = (record.duplicateDerivationsByStrategy[strategy] || 0) + 1;
        return false;
      }
      return true;
    });

    record.totalGenerated = generated.length;

    generated.sort((a,b) => {
      if (a.score > b.score)
        return -1;
      if (a.score < b.score)
        return 1;
      return 0;
    });

    // Evalute
    if (generated.length > 0 && this._evaluators.length == 0) {
      console.warn('No evaluators');
    }
    let evaluations = await Promise.all(this._evaluators.map(strategy => {
      return strategy.evaluate(this, generated);
    }));
    let fitness = Strategizer._mergeEvaluations(evaluations, generated);
    assert(fitness.length == generated.length);


    // Merge + Discard
    let discarded = [];
    let newGeneration = [];

    for (let i = 0; i < fitness.length; i++) {
      newGeneration.push({
        fitness: fitness[i],
        individual: generated[i],
      });
    }

    while (this._internalPopulation.length > (this._options.maxPopulation - this._options.discardSize)) {
      discarded.push(this._internalPopulation.pop().individual);
    }

    newGeneration.sort((x, y) => y.fitness - x.fitness);

    for (let i = 0; i < newGeneration.length && i < this._options.discardSize; i++) {
      if (i < this._options.discardSize) {
        this._internalPopulation.push(newGeneration[i]);
      } else {
        discarded.push(newGeneration[i].individual);
      }
    }

    // TODO: Instead of push+sort, merge `internalPopulation` with `generated`.
    this._internalPopulation.sort((x, y) => y.fitness - x.fitness);

    for (let strategy of this._strategies) {
      strategy.discard(discarded);
    }

    // Publish
    this._generation = generation;
    this._generated = generated;
    this._population = this._internalPopulation.map(x => x.individual);

    return record;
  }

  static _mergeEvaluations(evaluations, generated) {
    let n = generated.length;
    let mergedEvaluations = [];
    for (let i = 0; i < n; i++) {
      let merged = NaN;
      for (let evaluation of evaluations) {
        let fitness = evaluation[i];
        if (isNaN(fitness)) {
          continue;
        }
        if (isNaN(merged)) {
          merged = fitness;
        } else {
          // TODO: how should evaluations be combined?
          merged = (merged * i + fitness) / (i + 1);
        }
      }
      if (isNaN(merged)) {
        // TODO: What should happen when there was no evaluation?
        merged = 0.5;
      }
      mergedEvaluations.push(merged);
    }
    return mergedEvaluations;
  }

  static over(results, walker, strategy) {
    walker.onStrategy(strategy);
    results.forEach(result => {
      walker.onResult(result);
      walker.onResultDone();
    });
    walker.onStrategyDone();
    return walker.descendants;
  }
}

class Walker {
  constructor() {
    this.descendants = [];
  }

  onStrategy(strategy) {
    this.currentStrategy = strategy;
  }

  onResult(result) {
    this.currentResult = result;
  }

  createDescendant(result, score, hash, valid) {
    assert(this.currentResult, "no current result");
    assert(this.currentStrategy, "no current strategy");
    if (this.currentResult.score)
      score += this.currentResult.score;
    this.descendants.push({
      result,
      score,
      derivation: [{parent: this.currentResult, strategy: this.currentStrategy}],
      hash,
      valid,
    });
  }

  onResultDone() {
    this.currentResult = undefined;
  }

  onStrategyDone() {
    this.currentStrategy = undefined;
  }
}

Strategizer.Walker = Walker;

// TODO: Doc call convention, incl strategies are stateful.
class Strategy {
  async activate(strategizer) {
    // Returns estimated ability to generate/evaluate.
    // TODO: What do these numbers mean? Some sort of indication of the accuracy of the
    // generated individuals and evaluations.
    return {generate: 0, evaluate: 0};
  }
  async generate(strategizer, n) {
    return [];
  }
  discard(individuals) {
  }
  async evaluate(strategizer, individuals) {
    return individuals.map(() => NaN);
  }
}

Object.assign(module.exports, {
  Strategizer,
  Strategy,
});
