'use strict';

const { Writable } = require('stream');

const StreamSearch = require('streamsearch');

const PartStream = require('./PartStream');
const HeaderParser = require('./HeaderParser');

const DASH = 45;
const B_ONEDASH = Buffer.from('-');
const B_CRLF = Buffer.from('\r\n');
const EMPTY_FN = () => {};

class Dicer extends Writable {
  constructor(cfg) {
    super(cfg);

    if (!cfg || (!cfg.headerFirst && typeof cfg.boundary !== 'string'))
      throw new TypeError('Boundary required');

    if (typeof cfg.boundary === 'string')
      this.setBoundary(cfg.boundary);
    else
      this._bparser = undefined;

    this._headerFirst = cfg.headerFirst;

    this._dashes = 0;
    this._parts = 0;
    this._finished = false;
    this._realFinish = false;
    this._isPreamble = true;
    this._justMatched = false;
    this._firstWrite = true;
    this._inHeader = true;
    this._part = undefined;
    this._cb = undefined;
    this._ignoreData = false;
    this._partOpts = (typeof cfg.partHwm === 'number'
                      ? { highWaterMark: cfg.partHwm }
                      : {});
    this._pause = false;

    this._hparser = new HeaderParser(cfg);
    this._hparser.on('header', (header) => {
      this._inHeader = false;
      this._part.emit('header', header);
    });
    this._hparser.on('error', (err) => {
      if (this._part && !this._ignoreData) {
        this._part.emit('error', err);
        this._part.push(null);
      }
    });
  }

  emit(ev) {
    if (ev !== 'finish' || this._realFinish) {
      Writable.prototype.emit.apply(this, arguments);
      return;
    }

    if (this._finished)
      return;

    process.nextTick(() => {
      this.emit('error', new Error('Unexpected end of multipart data'));

      if (this._part && !this._ignoreData) {
        const type = (this._isPreamble ? 'Preamble' : 'Part');
        this._part.emit(
          'error',
          new Error(`${type} terminated early due to `
                    + 'unexpected end of multipart data')
        );
        this._part.push(null);
        process.nextTick(() => {
          this._realFinish = true;
          this.emit('finish');
          this._realFinish = false;
        });
        return;
      }

      this._realFinish = true;
      this.emit('finish');
      this._realFinish = false;
    });
  }

  _write(data, encoding, cb) {
    // Ignore unexpected data (e.g. extra trailer data after finished)
    if (!this._hparser && !this._bparser)
      return cb();

    if (this._headerFirst && this._isPreamble) {
      if (!this._part) {
        this._part = new PartStream(this._partOpts);
        if (this._events.preamble)
          this.emit('preamble', this._part);
        else
          ignore(this);
      }
      const r = this._hparser.push(data);
      if (!this._inHeader && r !== undefined && r < data.length)
        data = data.slice(r);
      else
        return cb();
    }

    // Allows for "easier" testing
    if (this._firstWrite) {
      this._bparser.push(B_CRLF);
      this._firstWrite = false;
    }

    this._bparser.push(data);

    if (this._pause)
      this._cb = cb;
    else
      cb();
  }

  reset() {
    this._part = undefined;
    this._bparser = undefined;
    this._hparser = undefined;
  }

  setBoundary(boundary) {
    this._bparser = new StreamSearch(`\r\n--${boundary}`, onInfo.bind(this));
  }
}

function onInfo(isMatch, data, start, end) {
  let buf;
  let i = 0;
  let r;
  let ev;
  let shouldWriteMore = true;

  if (!this._part && this._justMatched && data) {
    while (this._dashes < 2 && (start + i) < end) {
      if (data[start + i] === DASH) {
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
      this.reset();
      this._finished = true;
      // No more parts will be added
      if (this._parts === 0) {
        this._realFinish = true;
        this.emit('finish');
        this._realFinish = false;
      }
    }
    if (this._dashes)
      return;
  }
  if (this._justMatched)
    this._justMatched = false;
  if (!this._part) {
    this._part = new PartStream(this._partOpts);
    this._part._read = (n) => {
      unpause(this);
    };
    ev = this._isPreamble ? 'preamble' : 'part';
    if (this._events[ev])
      this.emit(ev, this._part);
    else
      ignore(this);
    if (!this._isPreamble)
      this._inHeader = true;
  }
  if (data && start < end && !this._ignoreData) {
    if (this._isPreamble || !this._inHeader) {
      if (buf)
        shouldWriteMore = this._part.push(buf);
      shouldWriteMore = this._part.push(data.slice(start, end));
      if (!shouldWriteMore)
        this._pause = true;
    } else if (!this._isPreamble && this._inHeader) {
      if (buf)
        this._hparser.push(buf);
      r = this._hparser.push(data.slice(start, end));
      if (!this._inHeader && r !== undefined && r < end)
        onInfo.call(this, false, data, start + r, end);
    }
  }
  if (isMatch) {
    this._hparser.reset();
    if (this._isPreamble) {
      this._isPreamble = false;
    } else {
      ++this._parts;
      this._part.on('end', () => {
        if (--this._parts === 0) {
          if (this._finished) {
            this._realFinish = true;
            this.emit('finish');
            this._realFinish = false;
          } else {
            unpause(this);
          }
        }
      });
    }
    this._part.push(null);
    this._part = undefined;
    this._ignoreData = false;
    this._justMatched = true;
    this._dashes = 0;
  }
}

function ignore(self) {
  if (self._part && !self._ignoreData) {
    self._ignoreData = true;
    self._part.on('error', EMPTY_FN);
    // We must perform some kind of read on the stream even though we are
    // ignoring the data, otherwise node's Readable stream will not emit 'end'
    // after pushing null to the stream
    self._part.resume();
  }
}

function unpause(self) {
  if (!self._pause)
    return;

  self._pause = false;
  if (self._cb) {
    const cb = self._cb;
    self._cb = undefined;
    cb();
  }
}

module.exports = Dicer;
