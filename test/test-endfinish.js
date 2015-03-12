var Dicer = require('..');
var assert = require('assert');

var CRLF     = '\r\n';
var boundary = 'boundary';

var write1 = [
  '--' + boundary,
  'Content-Type:   text/plain',
  'Content-Length: 0'
  ].join(CRLF)
  + CRLF + CRLF
  + '--' + boundary ;

var write2 = '--' + CRLF;

var firedEnd    = false;
var firedFinish = false;

var dicer = new Dicer({boundary: boundary});
dicer.on('part',   partListener);
dicer.on('finish', finishListener);
dicer.write(write1);

function partListener(partReadStream) {
  partReadStream.on('data', function(){});
  partReadStream.on('end',  partEndListener)
}
function partEndListener() {
  firedEnd = true;
  setImmediate(afterEnd);
}
function afterEnd() {
  dicer.end(write2);
  setImmediate(afterWrite);
}
function finishListener() {
  assert(firedEnd, 'Failed to end before finishing');
  firedFinish = true;
}
function afterWrite() {
  assert(firedFinish, 'Failed to finish');
}
