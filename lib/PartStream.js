var Stream = require('stream'),
    inherits = require('util').inherits;

function PartStream() {
  Stream.call(this);

  this.readable = true;
  this.paused = false;
  this._buffer = [];
  this._decoder = undefined;
}
inherits(PartStream, Stream);

PartStream.prototype._emit = PartStream.prototype.emit;
PartStream.prototype.emit = function(ev, arg1, arg2, arg3, arg4, arg5) {
  if (this.paused) {
    if (arg1 === undefined)
      this._buffer.push([ev]);
    else if (arg2 === undefined)
      this._buffer.push([ev, arg1]);
    else if (arg3 === undefined)
      this._buffer.push([ev, arg1, arg2]);
    else if (arg4 === undefined)
      this._buffer.push([ev, arg1, arg2, arg3]);
    else if (arg5 === undefined)
      this._buffer.push([ev, arg1, arg2, arg3, arg4]);
    else
      this._buffer.push([ev, arg1, arg2, arg3, arg4, arg5]);
  } else {
    if (ev === 'data' && this._decoder)
      this._emit(ev, this._decoder.write(arg1), arg2);
    else if (arg1 === undefined)
      this._emit(ev);
    else if (arg2 === undefined)
      this._emit(ev, arg1);
    else if (arg3 === undefined)
      this._emit(ev, arg1, arg2);
    else if (arg4 === undefined)
      this._emit(ev, arg1, arg2, arg3);
    else if (arg5 === undefined)
      this._emit(ev, arg1, arg2, arg3, arg4);
    else
      this._emit(ev, arg1, arg2, arg3, arg4, arg5);
  }
};

PartStream.prototype.setEncoding = function(encoding) {
  var StringDecoder = require('string_decoder').StringDecoder; // lazy load
  this._decoder = new StringDecoder(encoding);
};

PartStream.prototype.pause = function() {
  this.paused = true;
  this._channel._conn._sock.pause();
};

PartStream.prototype.resume = function() {
  this.paused = false;
  this._drainBuffer();
};

PartStream.prototype._drainBuffer = function() {
  var val, vallen;

  while (this._buffer.length && !this.paused) {
    val = this._buffer.shift();
    vallen = val.length;
    if (val[0] === 'data' && this._decoder)
      this._emit(val[0], this._decoder.write(val[1]), val[2]);
    else if (vallen === 1)
      this._emit(val[0]);
    else if (vallen === 2)
      this._emit(val[0], val[1]);
    else if (vallen === 3)
      this._emit(val[0], val[1], val[2]);
    else if (vallen === 4)
      this._emit(val[0], val[1], val[2], val[3]);
    else if (vallen === 5)
      this._emit(val[0], val[1], val[2], val[3], val[4]);
    else
      this._emit(val[0], val[1], val[2], val[3], val[4], val[5]);
  }
};

PartStream.prototype.destroy = function() {
  this.readable = false;
  this.paused = false;
  this._buffer = [];
  this._decoder = undefined;
  this.emit('close');
};

module.exports = PartStream;
