'use strict';

const assert = require('assert');

const { Readable, pipeline } = require('stream');
const Dicer = require('..');

const r = new Readable({ read() {} });
const d = new Dicer({ boundary: 'a' });

let isFinished = false;

d.on('part', async (part) => {
  part.resume();
});

r.push('--a\r\nA: 1\r\nB: 1\r\n\r\n123\r\n--a\r\n\r\n456\r\n--a--\r\n');
setImmediate(() => {
  r.push(null);
});

pipeline(r, d, (error) => {
  assert(isFinished === false, 'Double-invocation of pipeline callback');
  assert(error === undefined, 'Unexpected pipeline error');
  isFinished = true;
});

process.on('exit', () => {
  assert(isFinished === true, 'Should finish before exiting');
});
