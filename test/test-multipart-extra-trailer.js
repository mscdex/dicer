'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { inspect } = require('util');

const Dicer = require('..');

const FIXTURES_ROOT = `${__dirname}/fixtures/`;

let t = 0;
const group = path.basename(__filename, '.js') + '/';

function makeMsg(what, msg) {
  return '[' + group + what + ']: ' + msg;
}

process.on('exit', () => {
  assert(t === tests.length,
         makeMsg('_exit', 'Only ran ' + t + '/' + tests.length + ' tests'));
});

const tests = [
  { source: 'many',
    opts: { boundary: '----WebKitFormBoundaryWLHCs9qmcJJoyjKR' },
    chsize: 16,
    nparts: 7,
    what: 'Extra trailer data pushed after finished'
  },
];

function next() {
  if (t === tests.length)
    return;
  const v = tests[t];
  const fixtureBase = FIXTURES_ROOT + v.source;
  let n = 0;
  const buffer = Buffer.allocUnsafe(v.chsize);
  const state = { parts: [] };
  const fd = fs.openSync(fixtureBase + '/original', 'r');

  const dicer = new Dicer(v.opts);
  let error;
  let partErrors = 0;
  let finishes = 0;

  dicer.on('part', (p) => {
    const part = {
      body: undefined,
      bodylen: 0,
      error: undefined,
      header: undefined
    };

    p.on('header', (h) => {
      part.header = h;
    }).on('data', (data) => {
      // Make a copy because we are using readSync which re-uses a buffer ...
      const copy = Buffer.allocUnsafe(data.length);
      data.copy(copy);
      data = copy;
      if (!part.body)
        part.body = [ data ];
      else
        part.body.push(data);
      part.bodylen += data.length;
    }).on('error', (err) => {
      part.error = err;
      ++partErrors;
    }).on('end', () => {
      if (part.body)
        part.body = Buffer.concat(part.body, part.bodylen);
      state.parts.push(part);
    });
  }).on('error', (err) => {
    error = err;
  }).on('finish', () => {
    assert(finishes++ === 0, makeMsg(v.what, 'finish emitted multiple times'));

    if (v.dicerError)
      assert(error !== undefined, makeMsg(v.what, 'Expected error'));
    else
      assert(error === undefined, makeMsg(v.what, 'Unexpected error'));

    if (v.events && v.events.indexOf('part') > -1) {
      assert.equal(state.parts.length,
                   v.nparts,
                   makeMsg(v.what,
                           'Part count mismatch:\nActual: '
                           + state.parts.length
                           + '\nExpected: '
                           + v.nparts));

      if (!v.npartErrors)
        v.npartErrors = 0;
      assert.equal(partErrors,
                   v.npartErrors,
                   makeMsg(v.what,
                           'Part errors mismatch:\nActual: '
                           + partErrors
                           + '\nExpected: '
                           + v.npartErrors));

      for (let i = 0, header, body; i < v.nparts; ++i) {
        if (fs.existsSync(fixtureBase + '/part' + (i + 1))) {
          body = fs.readFileSync(fixtureBase + '/part' + (i + 1));
          if (body.length === 0)
            body = undefined;
        } else {
          body = undefined;
        }
        assert.deepEqual(state.parts[i].body,
                         body,
                         makeMsg(v.what,
                                 'Part #' + (i + 1) + ' body mismatch'));
        if (fs.existsSync(fixtureBase + '/part' + (i + 1) + '.header')) {
          header = fs.readFileSync(fixtureBase
                                   + '/part' + (i + 1) + '.header', 'latin1');
          header = JSON.parse(header);
        } else {
          header = undefined;
        }
        assert.deepEqual(state.parts[i].header,
                         header,
                         makeMsg(v.what,
                                 'Part #' + (i + 1)
                                 + ' parsed header mismatch:\nActual: '
                                 + inspect(state.parts[i].header)
                                 + '\nExpected: '
                                 + inspect(header)));
      }
    }
    ++t;
    next();
  });

  while (true) {
    n = fs.readSync(fd, buffer, 0, buffer.length, null);
    if (n === 0) {
      setTimeout(() => {
        dicer.write('\r\n\r\n\r\n');
        dicer.end();
      }, 50);
      break;
    }
    dicer.write(n === buffer.length ? buffer : buffer.slice(0, n));
  }
  fs.closeSync(fd);
}
next();
