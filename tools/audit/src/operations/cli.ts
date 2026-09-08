import { cliOptions } from "translation-core/cli-options";
import { dataDirectory, repositoryRoot } from "translation-core/paths";
import { problemSelection, type OperationItem } from "./types.ts";
export function cliContext(args = process.argv.slice(2)) {
  const options = cliOptions(args);
  return {
    repositoryRoot,
    dataRoot: dataDirectory(args),
    problems: problemSelection(options.problems),
    progress: (item: OperationItem) => {
      const details = item.details as
        { sampleWarnings?: string[]; warnings?: string[] } | undefined;
      for (const warning of details?.sampleWarnings ?? details?.warnings ?? [])
        console.warn(`${item.id}: warning: ${warning}`);
      (item.status === "failed" ? console.error : console.log)(item.message);
    },
  };
}
