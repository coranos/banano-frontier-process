'use strict';

// https://github.com/jsdoc/jsdoc/issues/1918
BigInt.prototype.toJSON = (a) => {
  return `${a}n`;
};


/** @namespace Main */
/** @namespace RPC */

/* eslint-disable no-unused-vars */
const index = require('./scripts/index.js');
/* eslint-enable no-unused-vars */
