#! /usr/bin/env node
if (process.argv[2] === 'init') {
  require('../dist/initCommand.js')
    .runInit()
    .catch((err) => {
      console.error('Error:', err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
} else {
  require('../dist/index.js').main();
}
