var EventEmitter = require('events').EventEmitter,
    inherits = require('util').inherits;

var StreamSearch = require('streamsearch');

var PartStream = require('./PartStream'),
    HeaderParser = require('./HeaderParser');

var B_ONEDASH = new Buffer('-'),
    B_CRLF = new Buffer('\r\n');

function Dicer(opts) {
  if (!(this instanceof Dicer))
    return new Dicer(opts);
  EventEmitter.call(this);

  if (!opts.headerFirst && typeof opts.boundary !== 'string')
    throw new TypeError('Boundary required');

  if (typeof opts.boundary === 'string')
    this.setBoundary(opts.boundary);
  else
    this._bparser = undefined;

  this._headerFirst = opts.headerFirst;

  var self = this;

  this._dashes = 0;
  this._isPreamble = true;
  this._justMatched = false;
  this._firstWrite = true;
  this._inHeader = true;
  this._part = undefined;

  this._hparser = new HeaderParser();
  this._hparser.on('header', function(header) {
    self._inHeader = false;
    self._part.emit('header', header);
  });

  this.writable = true;
}
inherits(Dicer, EventEmitter);

Dicer.prototype.write = function(data, encoding) {
  if (typeof data === 'string') {
    encoding = encoding || 'utf8';
    data = new Buffer(data, encoding);
  }

  if (this._headerFirst && this._isPreamble) {
    if (!this._part) {
      this._part = new PartStream();
      this.emit('preamble', this._part);
    }
    var r = this._hparser.push(data);
    if (!this._inHeader && r !== undefined && r < data.length)
      data = data.slice(r);
    else
      return true;
  }
    
  // allows for "easier" testing
  if (this._firstWrite) {
    this._bparser.push(B_CRLF);
    this._firstWrite = false;
  }

  this._bparser.push(data);

  return true;
};

Dicer.prototype.end = function(data, encoding) {
  if (data)
    this.write(data, encoding);
  this.destroy();
};

Dicer.prototype.destroy = function() {
  this.writable = false;
  this._part = undefined;
  this._bparser = undefined;
  this._hparser = undefined;
  this.emit('close');
};

Dicer.prototype.setBoundary = function(boundary) {
  var self = this;
  this._bparser = new StreamSearch('\r\n--' + boundary);
  this._bparser.on('info', function(isMatch, data, start, end) {
    self._oninfo(isMatch, data, start, end);
  });
};

Dicer.prototype._oninfo = function(isMatch, data, start, end) {
  var buf;

  if (!this._part && this._justMatched && data) {
    var i = 0;
    while (this._dashes < 2 && (start + i) < end) {
      if (data[start + i] === 45) {
        ++i;
        ++this._dashes;
      } else {
        if (this._dashes)
          buf = B_ONEDASH;
        this._dashes = 0;
        break;
      }
    }
    if (this._dashes === 2) {
      if ((start + i) < end && this._events.trailer)
        this.emit('trailer', data.slice(start + i, end));
      this.emit('end');
      this.destroy();
    }
    if (this._dashes)
      return;
  }
  if (this._justMatched)
    this._justMatched = false;
  if (!this._part) {
    this._part = new PartStream();
    this.emit(this._isPreamble ? 'preamble' : 'part', this._part);
    if (!this._isPreamble)
      this._inHeader = true;
  }
  if (data && start < end) {
    if (this._isPreamble || !this._inHeader) {
      if (buf)
        this._part.emit('data', buf);
      this._part.emit('data', data.slice(start, end));
    } else if (!this._isPreamble && this._inHeader) {
      if (buf)
        this._hparser.push(buf);
      var r = this._hparser.push(data.slice(start, end));
      if (!this._inHeader && r !== undefined && r < end)
        this._oninfo(false, data, start + r, end);
    }
  }
  if (isMatch) {
    if (this._isPreamble)
      this._isPreamble = false;
    this._hparser.reset();
    this._part.emit('end');
    this._part = undefined;
    this._justMatched = true;
    this._dashes = 0;
  }
};

module.exports = Dicer;
