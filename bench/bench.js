'use strict';

function createMultipartBuffer(boundary, sizes) {
  const bufs = [];
  for (let i = 0; i < sizes.length; ++i) {
    const mb = sizes[i] * 1024 * 1024;
    bufs.push(Buffer.from([
      `--${boundary}`,
      `content-disposition: form-data; name="field${i + 1}"`,
      '',
      '0'.repeat(mb),
      `--${boundary}--`,
      '',
    ].join('\r\n')));
  }
  return Buffer.concat(bufs);
}

const boundary = '-----------------------------168072824752491622650073';
const buffer = createMultipartBuffer(boundary, [
  10,
  10,
  10,
  20,
  50,
]);
const calls = {
  partBegin: 0,
  headerField: 0,
  headerValue: 0,
  headerEnd: 0,
  headersEnd: 0,
  partData: 0,
  partEnd: 0,
  end: 0,
};

const moduleName = process.argv[2];
switch (moduleName) {
  case 'dicer': {
    const Dicer = require('..');

    const parser = new Dicer({ boundary });
    parser.on('part', (p) => {
      ++calls.partBegin;
      p.on('header', (header) => {
        ++calls.headersEnd;
      });
      p.on('data', (data) => {
        ++calls.partData;
      });
      p.on('end', () => {
        ++calls.partEnd;
      });
    }).on('end', () => {
      ++calls.end;
    });

    console.time(moduleName);
    parser.write(buffer);
    console.timeEnd(moduleName);
    break;
  }

  case 'formidable': {
    const { MultipartParser } = require('formidable');

    const parser = new MultipartParser();
    parser.initWithBoundary(boundary);
    parser.on('data', ({ name }) => {
      ++calls[name];
    });

    console.time(moduleName);
    parser.write(buffer);
    console.timeEnd(moduleName);

    break;
  }

  case 'multiparty': {
    const { Readable } = require('stream');

    const { Form } = require('multiparty');

    const form = new Form({
      maxFieldsSize: Infinity,
      maxFields: Infinity,
      maxFilesSize: Infinity,
      autoFields: false,
      autoFiles: false,
    });

    const req = new Readable({ read: () => {} });
    req.headers = {
      'content-type': `multipart/form-data; boundary=${boundary}`,
    };
    req.push(buffer);
    req.push(null);

    function hijack(name, fn) {
      const oldFn = form[name];
      form[name] = function() {
        fn();
        return oldFn.apply(this, arguments);
      };
    }

    hijack('onParseHeaderField', () => {
      ++calls.headerField;
    });
    hijack('onParseHeaderValue', () => {
      ++calls.headerValue;
    });
    hijack('onParsePartBegin', () => {
      ++calls.partBegin;
    });
    hijack('onParsePartData', () => {
      ++calls.partData;
    });
    hijack('onParsePartEnd', () => {
      ++calls.partEnd;
    });

    form.on('close', () => {
      ++calls.end;
      console.timeEnd(moduleName);
    }).on('part', (p) => p.resume());

    console.time(moduleName);
    form.parse(req);

    break;
  }

  default:
    if (moduleName === undefined)
      console.error('Missing parser module name');
    else
      console.error(`Invalid parser module name: ${moduleName}`);
    process.exit(1);
}
