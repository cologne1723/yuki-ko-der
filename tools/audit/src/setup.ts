import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { cliOptions } from "translation-core/cli-options";
import { dataDirectory, repositoryRoot } from "translation-core/paths";
import { setupData } from "./operations/setup.ts";
import { problemSelection } from "./operations/types.ts";
export async function runSetup(
  args = process.argv.slice(2),
  preferred?: "pages" | "problems",
) {
  const options = cliOptions(args);
  const selection =
    options["pages-only"] || preferred === "pages"
      ? "pages"
      : options["problems-only"] || preferred === "problems"
        ? "problems"
        : "both";
  const result = await setupData(
    {
      repositoryRoot,
      dataRoot: dataDirectory(args),
      problems: problemSelection(options.problems),
      refresh: options.refresh === true,
      progress: (item) =>
        console.log(`${item.id}: ${item.status}: ${item.message}`),
    },
    selection,
  );
  const failures = result.items.filter(
    (item) => item.status === "failed" || item.status === "review-required",
  );
  console.log(
    `Setup complete: ${result.items.length} items; ${failures.length} require attention. Data: ${dataDirectory(args)}`,
  );
  // Optional preview failures retain their historical non-blocking CLI behavior.
  if (failures.some((item) => /^\d+$/.test(item.id))) process.exitCode = 1;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  await runSetup();
