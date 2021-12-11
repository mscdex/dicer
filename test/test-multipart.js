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

process.on('exit', function() {
  assert(t === tests.length,
         makeMsg('_exit', 'Only ran ' + t + '/' + tests.length + ' tests'));
});

const tests = [
  { source: 'nested',
    opts: { boundary: 'AaB03x' },
    chsize: 32,
    nparts: 2,
    what: 'One nested multipart'
  },
  { source: 'many',
    opts: { boundary: '----WebKitFormBoundaryWLHCs9qmcJJoyjKR' },
    chsize: 16,
    nparts: 7,
    what: 'Many parts'
  },
  { source: 'many-wrongboundary',
    opts: { boundary: 'LOLOLOL' },
    chsize: 8,
    nparts: 0,
    dicerError: true,
    what: 'Many parts, wrong boundary'
  },
  { source: 'many-noend',
    opts: { boundary: '----WebKitFormBoundaryWLHCs9qmcJJoyjKR' },
    chsize: 16,
    nparts: 7,
    npartErrors: 1,
    dicerError: true,
    what: 'Many parts, end boundary missing, 1 file open'
  },
  { source: 'nested-full',
    opts: { boundary: 'AaB03x', headerFirst: true },
    chsize: 32,
    nparts: 2,
    what: 'One nested multipart with preceding header'
  },
  { source: 'nested-full',
    opts: { headerFirst: true },
    chsize: 32,
    nparts: 2,
    setBoundary: 'AaB03x',
    what: 'One nested multipart with preceding header, using setBoundary'
  },
];

function next() {
  if (t === tests.length)
    return;
  const v = tests[t];
  const fixtureBase = FIXTURES_ROOT + v.source;
  const state = { parts: [], preamble: undefined };

  const dicer = new Dicer(v.opts);
  let error;
  let partErrors = 0;
  let finishes = 0;

  dicer.on('preamble', (p) => {
    const preamble = {
      body: undefined,
      bodylen: 0,
      error: undefined,
      header: undefined
    };

    p.on('header', (h) => {
      preamble.header = h;
      if (v.setBoundary)
        dicer.setBoundary(v.setBoundary);
    }).on('data', (data) => {
      // Make a copy because we are using readSync which re-uses a buffer ...
      const copy = Buffer.allocUnsafe(data.length);
      data.copy(copy);
      data = copy;
      if (!preamble.body)
        preamble.body = [ data ];
      else
        preamble.body.push(data);
      preamble.bodylen += data.length;
    }).on('error', (err) => {
      preamble.error = err;
    }).on('end', () => {
      if (preamble.body)
        preamble.body = Buffer.concat(preamble.body, preamble.bodylen);
      if (preamble.body || preamble.header)
        state.preamble = preamble;
    });
  });
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

    if (v.dicerError) {
      assert(error !== undefined, makeMsg(v.what, 'Expected error'));
    } else {
      assert(error === undefined,
             makeMsg(v.what, 'Unexpected error: ' + error));
    }

    let preamble;
    if (fs.existsSync(fixtureBase + '/preamble')) {
      const prebody = fs.readFileSync(fixtureBase + '/preamble');
      if (prebody.length) {
        preamble = {
          body: prebody,
          bodylen: prebody.length,
          error: undefined,
          header: undefined
        };
      }
    }
    if (fs.existsSync(fixtureBase + '/preamble.header')) {
      const prehead = JSON.parse(fs.readFileSync(
        fixtureBase + '/preamble.header', 'latin1'
      ));
      if (!preamble) {
        preamble = {
          body: undefined,
          bodylen: 0,
          error: undefined,
          header: prehead
        };
      } else {
        preamble.header = prehead;
      }
    }
    if (fs.existsSync(fixtureBase + '/preamble.error')) {
      const err = new Error(fs.readFileSync(
        fixtureBase + '/preamble.error', 'latin1'
      ));
      if (!preamble) {
        preamble = {
          body: undefined,
          bodylen: 0,
          error: err,
          header: undefined
        };
      } else {
        preamble.error = err;
      }
    }

    assert.deepEqual(state.preamble,
                     preamble,
                     makeMsg(v.what,
                             'Preamble mismatch:\nActual:'
                             + inspect(state.preamble)
                             + '\nExpected: '
                             + inspect(preamble)));

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
    ++t;
    next();
  });

  fs.createReadStream(fixtureBase + '/original').pipe(dicer);
}
next();
