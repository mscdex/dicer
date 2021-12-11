'use strict';

const assert = require('assert');
const path = require('path');

const HeaderParser = require('../lib/HeaderParser');

const DCRLF = '\r\n\r\n';
const MAXED_BUFFER = Buffer.allocUnsafe(128 * 1024);
MAXED_BUFFER.fill(0x41); // 'A'

const group = path.basename(__filename, '.js') + '/';

function makeMsg(what, msg) {
  return `[${group}${what}]: ${msg}`;
}

[
  { source: DCRLF,
    expected: {},
    what: 'No header'
  },
  { source: [
      'Content-Type:\t  text/plain',
      'Content-Length:0',
    ].join('\r\n') + DCRLF,
    expected: {
      'content-type': ['  text/plain'],
      'content-length': ['0'],
    },
    what: 'Value spacing',
  },
  { source: [
      'Content-Type:\r\n text/plain',
      'Foo:\r\n bar\r\n baz',
    ].join('\r\n') + DCRLF,
    expected: {
      'content-type': [' text/plain'],
      'foo': [' bar baz'],
    },
    what: 'Folded values',
  },
  { source: [
      'Content-Type:',
      'Foo: ',
    ].join('\r\n') + DCRLF,
    expected: {
      'content-type': [''],
      'foo': [''],
    },
    what: 'Empty values',
  },
  { source: MAXED_BUFFER.toString('ascii') + DCRLF,
    expected: {},
    what: 'Max header size (single chunk)',
  },
  { source: [
      'ABCDEFGHIJ',
      MAXED_BUFFER.toString('ascii'),
      DCRLF,
    ],
    expected: {},
    what: 'Max header size (multiple chunks #1)',
  },
  { source: [
      MAXED_BUFFER.toString('ascii'),
      MAXED_BUFFER.toString('ascii'),
      DCRLF,
    ],
    expected: {},
    what: 'Max header size (multiple chunk #2)',
  },
].forEach((v) => {
  const parser = new HeaderParser();
  let fired = false;

  parser.on('header', (header) => {
    assert(!fired, makeMsg(v.what, 'Header event fired more than once'));
    fired = true;
    assert.deepEqual(header,
                     v.expected,
                     makeMsg(v.what, 'Parsed result mismatch'));
  });
  if (!Array.isArray(v.source))
    v.source = [v.source];
  for (const chunk of v.source)
    parser.push(chunk);
  assert(fired, makeMsg(v.what, 'Did not receive header from parser'));
});

{
  const source = [
    ' Content-Disposition: form-data; name="bildbeschreibung"',
    DCRLF,
    DCRLF,
    DCRLF,
  ];
  const parser = new HeaderParser();
  let hadError = false;

  parser.on('header', (header) => {
    assert(false, 'Should not have seen header');
  });
  parser.on('error', (err) => {
    assert(!hadError, 'Unexpected multiple errors');
    hadError = true;
    assert(/unexpected folded/i.test(err.message),
           `Wrong error message: ${err.message}`);
  });
  for (const chunk of source)
    parser.push(chunk);
  assert(hadError, 'Expected error');
}
