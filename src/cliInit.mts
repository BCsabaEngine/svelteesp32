import { runInit } from './initCommand.js';

try {
  await runInit();
} catch (error: unknown) {
  console.error('Error:', error instanceof Error ? error.message : String(error));
  process.exit(1);
}
