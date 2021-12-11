'use strict';

const EventEmitter = require('events');

const StreamSearch = require('streamsearch');

const B_DCRLF = Buffer.from('\r\n\r\n');
const RE_CRLF = /\r\n/g;
// eslint-disable-next-line no-control-regex
const RE_HDR = /^([^:]+):[ \t]?([\x00-\xFF]+)?$/;
const MAX_HEADER_PAIRS = 2000; // From node's http.js
const MAX_HEADER_SIZE = 80 * 1024; // From node's http_parser

class HeaderParser extends EventEmitter {
  constructor(cfg) {
    super();

    this.nread = 0;
    this.maxed = false;
    this.npairs = 0;
    this.maxHeaderPairs = (cfg && typeof cfg.maxHeaderPairs === 'number'
                           ? cfg.maxHeaderPairs
                           : MAX_HEADER_PAIRS);
    this.buffer = '';
    this.header = {};
    this.finished = false;
    this.ss = new StreamSearch(B_DCRLF, (isMatch, data, start, end) => {
      if (data && !this.maxed) {
        if (this.nread + (end - start) > MAX_HEADER_SIZE) {
          end = (MAX_HEADER_SIZE - this.nread);
          this.nread = MAX_HEADER_SIZE;
        } else {
          this.nread += (end - start);
        }

        if (this.nread === MAX_HEADER_SIZE)
          this.maxed = true;

        this.buffer += data.toString('latin1', start, end);
      }
      if (isMatch)
        this._finish();
    });
  }

  push(data) {
    const r = this.ss.push(data);
    if (this.finished)
      return r;
  }

  reset() {
    this.finished = false;
    this.buffer = '';
    this.header = {};
    this.ss.reset();
  }

  _finish() {
    let hadError = false;
    if (this.buffer)
      hadError = !parseHeader(this);
    this.ss.matches = this.ss.maxMatches;
    const header = this.header;
    this.header = {};
    this.buffer = '';
    this.finished = true;
    this.nread = this.npairs = 0;
    this.maxed = false;
    if (!hadError)
      this.emit('header', header);
  }
}

function parseHeader(self) {
  if (self.npairs === self.maxHeaderPairs)
    return true;

  const lines = self.buffer.split(RE_CRLF);
  const len = lines.length;
  let m;
  let h;
  let modded = false;

  for (let i = 0; i < len; ++i) {
    if (lines[i].length === 0)
      continue;

    if (lines[i][0] === '\t' || lines[i][0] === ' ') {
      // Folded header content
      // RFC2822 says to just remove the CRLF and not the whitespace following
      // it, so we follow the RFC and include the leading whitespace ...
      if (!h) {
        self.emit('error', new Error('Unexpected folded header value'));
        return false;
      }
      self.header[h][self.header[h].length - 1] += lines[i];
    } else {
      m = RE_HDR.exec(lines[i]);
      if (m) {
        h = m[1].toLowerCase();
        if (m[2]) {
          if (self.header[h] === undefined)
            self.header[h] = [m[2]];
          else
            self.header[h].push(m[2]);
        } else {
          self.header[h] = [''];
        }
        if (++self.npairs === self.maxHeaderPairs)
          break;
      } else {
        self.buffer = lines[i];
        modded = true;
        break;
      }
    }
  }
  if (!modded)
    self.buffer = '';

  return true;
}

module.exports = HeaderParser;
