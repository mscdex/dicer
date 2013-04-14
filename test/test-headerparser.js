var assert = require('assert'),
    HeaderParser = require('../lib/HeaderParser');

var parser, fired, DCRLF = '\r\n\r\n';

[
  [ DCRLF,
    {}
  ],
  [ ['Content-Type:\t  text/plain',
     'Content-Length:0'
    ].join('\r\n') + DCRLF,
    {'content-type': ['  text/plain'], 'content-length': ['0']}
  ],
  [ ['Content-Type:\r\n text/plain',
     'Foo:\r\n bar\r\n baz',
    ].join('\r\n') + DCRLF,
    {'content-type': [' text/plain'], 'foo': [' bar baz']}
  ],
  [ ['Content-Type:',
     'Foo: ',
    ].join('\r\n') + DCRLF,
    {'content-type': [''], 'foo': ['']}
  ],
].forEach(function(v, i) {
  parser = new HeaderParser();
  fired = false;
  parser.on('header', function(header) {
    assert(!fired, 'Test #' + (i+1) + ': Header event fired more than once')
    fired = true;
    assert.deepEqual(header, v[1]);
  });
  parser.push(v[0]);
  assert(fired, 'Test #' + (i+1) + ': Did not receive header from parser');
  fired = false;
});