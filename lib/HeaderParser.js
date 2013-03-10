var EventEmitter = require('events').EventEmitter,
    inherits = require('util').inherits;

var StreamSearch = require('streamsearch');

var B_DCRLF = new Buffer('\r\n\r\n'),
    RE_CRLF = /\r\n/g,
    RE_HDR = /^([^:]+):[ \t]?(.+)?$/;

function HeaderParser() {
  EventEmitter.call(this);

  var self = this;
  this.buffer = '';
  this.header = {};
  this.finished = false;
  this.ss = new StreamSearch(B_DCRLF);
  this.ss.on('info', function(isMatch, data, start, end) {
    if (data) {
      self.buffer += data.toString('ascii', start, end);
      if (RE_CRLF.test(self.buffer))
        self._parseHeader();
    }
    if (isMatch) {
      if (self.buffer)
        self._parseHeader();
      self.ss.matches = self.ss.maxMatches;
      var header = self.header;
      self.header = {};
      self.buffer = '';
      self.finished = true;
      self.emit('header', header);
    }
  });
}
inherits(HeaderParser, EventEmitter);

HeaderParser.prototype.push = function(data) {
  var r = this.ss.push(data);
  if (this.finished)
    return r;
};

HeaderParser.prototype.reset = function() {
  this.finished = false;
  this.buffer = '';
  this.header = {};
  this.ss.reset();
};

HeaderParser.prototype._parseHeader = function() {
  var lines = this.buffer.split(RE_CRLF), len = lines.length, m, h,
      modded = false;

  for (var i = 0; i < len; ++i) {
    if (lines[i].length === 0)
      continue;
    if (lines[i][0] === '\t' || lines[i][0] === ' ') {
      // folded header content
      // RFC2822 says to just remove the CRLF and not the whitespace following
      // it, so we follow the RFC and include the leading whitespace ...
      this.header[h][this.header[h].length - 1] += lines[i];
    } else {
      m = RE_HDR.exec(lines[i]);
      if (m) {
        h = m[1].toLowerCase();
        if (m[2]) {
          if (this.header[h] === undefined)
            this.header[h] = [m[2]];
          else
            this.header[h].push(m[2]);
        } else
          this.header[h] = [''];
      } else {
        this.buffer = lines[i];
        modded = true;
        break;
      }
    }
  }
  if (!modded)
    this.buffer = '';
};

module.exports = HeaderParser;
