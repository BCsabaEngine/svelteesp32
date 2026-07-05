import { existsSync, statSync } from 'node:fs';

import { parseArguments } from './commandLine';
import { getSourcepathNotFoundError } from './errorMessages';
import { OverBudgetError, runPipeline } from './pipeline';

export function main(): void {
  const commandLine = parseArguments();

  if (!existsSync(commandLine.sourcepath)) {
    console.error(getSourcepathNotFoundError(commandLine.sourcepath, 'not_found'));
    process.exit(1);
  }

  if (!statSync(commandLine.sourcepath).isDirectory()) {
    console.error(getSourcepathNotFoundError(commandLine.sourcepath, 'not_directory'));
    process.exit(1);
  }

  console.log(`[SvelteESP32] Generate code for ${commandLine.engine} engine`);

  try {
    runPipeline(commandLine);
  } catch (error) {
    if (!(error instanceof OverBudgetError)) {
      const message = error instanceof Error ? error.message : String(error);
      if (message) console.error(message);
    }
    process.exit(1);
  }
}

export {
  calculateCompressionRatio,
  createSourceEntry,
  formatAnalyzeTable,
  formatChangeSummary,
  formatCompressionLog,
  formatDryRunRoutes,
  formatSize,
  formatSizePrecise,
  type PreviousManifestFile,
  shouldUseGzip,
  updateExtensionGroup
} from './pipeline';

if (require.main === module) main();
