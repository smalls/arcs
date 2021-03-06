// Copyright (c) 2017 Google Inc. All rights reserved.
// This code may only be used under the BSD style license found at
// http://polymer.github.io/LICENSE.txt
// Code distributed by Google as part of this project is also
// subject to an additional IP rights grant found at
// http://polymer.github.io/PATENTS.txt

let {Strategy} = require('../../strategizer/strategizer.js');
let Recipe = require('../recipe/recipe.js');
let RecipeWalker = require('../recipe/walker.js');
let RecipeUtil = require('../recipe/recipe-util.js');

class MapConsumedSlots extends Strategy {
  async generate(strategizer) {
    var results = Recipe.over(strategizer.generated, new class extends RecipeWalker {
      onSlotConnection(recipe, slotConnection) {
        if (slotConnection.targetSlot)
          return;
        var potentialSlots = recipe.slots.filter(slot => {
          if (slotConnection.name != slot.name)
            return false;
          var views = slot.viewConnections.map(connection => connection.view);
          if (views.length == 0) {
            return true;
          }
          var particle = slotConnection.particle;
          for (var name in particle.connections) {
            var connection = particle.connections[name];
            if (views.includes(connection.view))
              return true;
          }
          return false;
        });
        return potentialSlots.map(slot => {
          return (recipe, slotConnection) => {
            let clonedSlot = recipe.updateToClone({slot})
            slotConnection.connectToSlot(clonedSlot.slot);
            return 1;
          };
        });
      }
    }(RecipeWalker.Permuted), this);

    return { results, generate: null };
  }
}

module.exports = MapConsumedSlots;
