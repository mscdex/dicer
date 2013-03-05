
Description
===========

A very fast streaming multipart parser for node.js.


Requirements
============

* [node.js](http://nodejs.org/) -- v0.8.0 or newer


Install
============

    npm install dicer


Examples
========

* Parse an HTTP form upload

```javascript
var inspect = require('util').inspect,
    http = require('http');

var Dicer = require('dicer');

var RE_BOUNDARY = /^multipart\/form-data.*?(?:; boundary=(?:(?:"(.+)")|(?:([^\s]+))))$/i;

http.createServer(function(req, res) {
  var m;
  if (req.header['content-type'] && (m = RE_BOUNDARY.exec(req.header['content-type']))) {
    var d = new Dicer({ boundary: m[1] || m[2] });

    d.on('part', function(p) {
      console.log('New part!');
      p.on('header', function(header) {
        for (var h in header)
          console.log('Part header: k: ' + inspect(h) + ', v: ' + inspect(header[h]));
      });
      p.on('data', function(data) {
        console.log('Part data: ' + inspect(data.toString()));
      });
      p.on('end', function() {
        console.log('End of part\n');
      });
    });
    d.on('end', function() {
      console.log('End of parts');
      res.writeHead(200);
      res.end();
    });
    req.pipe(d);
  } else {
    res.writeHead(404);
    res.end();
  }
}).listen(8080, function() {
  console.log('Listening for requests');
});
```


API
===

_Dicer_ is a _WritableStream_

Dicer (special) events
----------------------

* **end**() - Emitted when all parts have been parsed.

* **part**(< _PartStream_ >stream) - Emitted when a new part has been found.

* **preamble**(< _ReadableStream_ >stream) - Emitted for preamble data if you should happen to need it (this should almost always be ignored though).

* **trailer**(< _Buffer_ >data) - Emitted when trailing data was found after the terminating boundary (as with the preamble, this should be ignored too).


Dicer methods
-------------

* **(constructor)**(< _object_ >config) - Creates and returns a new Dicer instance with the following valid `config` settings:

    * **boundary** - _string_ - This is the boundary used to detect the beginning of a new part.

* **reset**() - _(void)_ - Resets internal state.



_PartStream_ is a _ReadableStream_

PartStream (special) events
---------------------------

* **header**(< _object_ >header) - An object containing the header for this particular part. Each property value is an _array_ of one or more header values.
