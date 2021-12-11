'use strict';

const { Readable } = require('stream');

class PartStream extends Readable {
  _read(n) {}
}

module.exports = PartStream;
