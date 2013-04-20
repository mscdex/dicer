var inherits = require('util').inherits;
var ReadableStream = require('readable-stream');

function PartStream() {
  if (!(this instanceof PartStream))
    return new PartStream();
  ReadableStream.call(this);
}
inherits(PartStream, ReadableStream);

PartStream.prototype._read = function(n) {};

module.exports = PartStream;
