var EventEmitter = require('events').EventEmitter,
    inherits = require('util').inherits;

var StreamSearch = require('streamsearch');

var PartStream = require('./PartStream'),
    HeaderParser = require('./HeaderParser');

var B_ONEDASH = new Buffer('-'),
    B_CRLF = new Buffer('\r\n');

function Dicer(conf) {
  if (!(this instanceof Dicer))
    return new Dicer(conf);
  EventEmitter.call(this);

  if (typeof conf.boundary !== 'string')
    throw new TypeError('Boundary required');

  var self = this, isPreamble = true, inHeader = true, dashes = 0;
  this._justMatched = false;
  this._firstWrite = true;
  this._bparser = new StreamSearch('\r\n--' + conf.boundary);
  this._bparser.on('info', function redo(isMatch, data, start, end) {
    var buf;
    if (!self._part && self._justMatched && data) {
      var i = 0;
      while (dashes < 2 && (start + i) < end) {
        if (data[start + i] === 45) {
          ++i;
          ++dashes;
        } else {
          if (dashes)
            buf = B_ONEDASH;
          dashes = 0;
          break;
        }
      }
      if (dashes === 2) {
        if ((start + i) < end && self._events['trailer'])
          self.emit('trailer', data.slice(start + i, end));
        self.emit('end');
        self.destroy();
      }
      if (dashes)
        return;
    }
    if (self._justMatched)
      self._justMatched = false;
    if (!self._part) {
      self._part = new PartStream();
      self.emit(isPreamble ? 'preamble' : 'part', self._part);
      if (!isPreamble)
        inHeader = true;
    }
    if (data && start < end) {
      if (isPreamble || !inHeader) {
        if (buf)
          self._part.emit('data', buf);
        self._part.emit('data', data.slice(start, end));
      } else if (!isPreamble && inHeader) {
        if (buf)
          self._parser.push(buf);
        var r = self._parser.push(data.slice(start, end));
        if (!inHeader && r !== undefined && r < end)
          redo(false, data, start + r, end);
      }
    }
    if (isMatch) {
      if (isPreamble)
        isPreamble = false;
      self._parser.reset();
      self._part.emit('end');
      self._part = undefined;
      self._justMatched = true;
      dashes = 0;
    }
  });
  this._part = undefined;
  this._parser = new HeaderParser();
  this._parser.on('header', function(header) {
    inHeader = false;
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

  if (this._firstWrite) {
    this._bparser.push(B_CRLF);
    this._firstWrite = false;
  }

  this._bparser.push(data);

  return true;
};

Dicer.prototype.end = function(data, encoding) {
  this.write(data, encoding);
  this.destroy();
};

Dicer.prototype.destroy = function() {
  this.writable = false;
  this._part = undefined;
  this._parser = undefined;
  this._hparser = undefined;
  this._justMatched = false;
  this._firstWrite = true;
  this.emit('close');
};

module.exports = Dicer;
