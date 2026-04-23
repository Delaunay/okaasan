import * as Blockly from 'blockly/core';

interface KiwiMutatorData {
    inputCount: 0
};

// // definition
// {
//     "mutator": "my_mut"
// }

// //
// {
//     "extraState": {
//          "whatever"
//     }
// }

const kiwiMutator = {
    data: {},

    updateShape_: function (targetCount) {
        while (this.itemCount_ < targetCount) {
          this.addPart_();
        }
        while (this.itemCount_ > targetCount) {
          this.removePart_();
        }
        this.updateMinus_();
    },
    
    // JSON
    saveExtraState: function() {
        return {
          'kiwi': this.data,
        };
    },
      
    loadExtraState: function(state) {
        this.data = state['kiwi'];
        // This is a helper function which adds or removes inputs from the block.
        this.updateShape_();
    },

    // XML
    // mutationToDom: function () {
    //     const container = Blockly.utils.xml.createElement('mutation');
    //     container.setAttribute('inputCount', this.data.inputCount);
    //     return container;
    // },

    // domToMutation: function (xmlElement) {
    //     const targetCount = parseInt(xmlElement.getAttribute('inputCount'), 10);
    //     this.updateShape_(targetCount);
    // },
}


const kwiInit = function () {
    // this.getInput('EMPTY').insertFieldAt(0, createPlusField(), 'PLUS');
    // this.updateShape_(3);
};
  

Blockly.Extensions.registerMutator(
    'kiwi_mutator', kiwiMutator, kwiInit
);
  