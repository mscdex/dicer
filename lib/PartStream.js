var inherits = require('util').inherits;
var PassThroughStream = require('readable-stream').PassThrough;

function PartStream() {
  if (!(this instanceof PartStream))
    return new PartStream();
  PassThroughStream.call(this);
}
inherits(PartStream, PassThroughStream);

module.exports = PartStream;
