import { cmdLine } from './commandLine';
import { OverBudgetError, runPipeline } from './pipeline';

export function main(): void {
  try {
    runPipeline(cmdLine);
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
