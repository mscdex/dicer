'use strict';

const assert = require('assert');

const Dicer = require('..');

const CRLF = '\r\n';
const boundary = 'boundary';

const writeSep = `--${boundary}`;

const writePart = [
  writeSep,
  'Content-Type:   text/plain',
  'Content-Length: 0'
].join(CRLF) + `${CRLF}${CRLF}some data${CRLF}`;

const writeEnd = `--${CRLF}`;

let firedEnd = false;
let firedFinish = false;

const dicer = new Dicer({ boundary });
dicer.on('part', partListener);
dicer.on('finish', finishListener);
dicer.write(writePart + writeSep);

function partListener(partReadStream) {
  partReadStream.on('data', () => {});
  partReadStream.on('end', partEndListener);
}

function partEndListener() {
  firedEnd = true;
  setImmediate(afterEnd);
}

function afterEnd() {
  dicer.end(writeEnd);
  setImmediate(afterWrite);
}

function finishListener() {
  assert(firedEnd, 'Failed to end before finishing');
  firedFinish = true;
  test2();
}

function afterWrite() {
  assert(firedFinish, 'Failed to finish');
}

let isPausePush = true;

let firedPauseCallback = false;
let firedPauseFinish = false;

let dicer2 = null;

function test2() {
  dicer2 = new Dicer({ boundary });
  dicer2.on('part', pausePartListener);
  dicer2.on('finish', pauseFinish);
  dicer2.write(writePart + writeSep, 'utf8', pausePartCallback);
  setImmediate(pauseAfterWrite);
}

function pausePartListener(partReadStream) {
  partReadStream.on('data', () => {});
  partReadStream.on('end', () => {});
  const realPush = partReadStream.push;
  partReadStream.push = (...args) => {
    realPush.apply(partReadStream, args);
    if (!isPausePush)
      return true;
    isPausePush = false;
    return false;
  };
}

function pauseAfterWrite() {
  dicer2.end(writeEnd);
  setImmediate(pauseAfterEnd);
}

function pauseAfterEnd() {
  assert(firedPauseCallback, 'Failed to call callback after pause');
  assert(firedPauseFinish, 'Failed to finish after pause');
}

function pauseFinish() {
  firedPauseFinish = true;
}

function pausePartCallback() {
  firedPauseCallback = true;
}
