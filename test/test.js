'use strict';

require('fs').readdirSync(__dirname).forEach((f) => {
  if (f.substr(0, 5) === 'test-')
    require(`./${f}`);
});
