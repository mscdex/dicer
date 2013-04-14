var Dicer = require('..');
var assert = require('assert'),
    fs = require('fs');

[
  { source: 'nested', boundary: 'AaB03x', chsize: 32, nparts: 2 },
].forEach(function(v, t) {
  var fd = fs.openSync('fixtures/' + v.source, 'r'), n = 0,
      errPrefix = 'Test #' + (t+1) + ': ',
      buffer = new Buffer(v.chsize),
      state = { done: false, parts: [] },
      part = { body: undefined, bodylen: 0, header: undefined };

  var dicer = new Dicer({ boundary: v.boundary });
  dicer.on('part', function(p) {
    p.on('header', function(h) {
      part.header = h;
    });
    p.on('data', function(data) {
      // make a copy because we are using readSync which re-uses a buffer ...
      var copy = new Buffer(data.length);
      data.copy(copy);
      data = copy;
      if (!part.body)
        part.body = [ data ];
      else
        part.body.push(data);
      part.bodylen += data.length;
    });
    p.on('end', function() {
      if (part.body)
        part.body = Buffer.concat(part.body, part.bodylen);
      state.parts.push(part);
      part = { body: undefined, bodylen: 0, header: undefined };
    });
  })
  .on('end', function() {
    state.done = true;
  });

  while (true) {
    n = fs.readSync(fd, buffer, 0, buffer.length, null);
    if (n === 0) {
      dicer.end();
      break;
    }
    dicer.write(n === buffer.length ? buffer : buffer.slice(0, n));
  }
  fs.closeSync(fd);

  assert(state.done, errPrefix + 'Parser did not finish');
  assert.equal(state.parts.length, v.nparts, errPrefix + 'Part count mismatch. Actual: ' + state.parts.length + '. Expected: ' + v.nparts);
  for (var i = 0, header; i < v.nparts; ++i) {
    assert.deepEqual(fs.readFileSync('fixtures/' + v.source + '.part' + (i+1)), state.parts[i].body, errPrefix + 'Part #' + (i+1) + ' body mismatch');
    header = undefined;
    try {
      header = fs.readFileSync('fixtures/' + v.source + '.part' + (i+1) + '.header', 'binary');
      header = JSON.parse(header);
    } catch (err) {}
    assert.deepEqual(state.parts[i].header, header, errPrefix + 'Part #' + (i+1) + ' header mismatch:\n' + JSON.stringify(state.parts[i].header) + '\n' + JSON.stringify(header));
  }
});
