#! /usr/bin/env node
if (process.argv[2] === 'init') {
  require('../dist/initCommand.js')
    .runInit()
    .catch((err) => {
      console.error('Error:', err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
} else if (process.argv[2] === 'doctor' || process.argv[2] === 'check') {
  process.argv.splice(2, 1);
  require('../dist/doctor.js').main();
} else {
  require('../dist/index.js').main();
}
