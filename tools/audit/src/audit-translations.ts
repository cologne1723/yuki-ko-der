import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { cliOptions } from "translation-core/cli-options";
import { repositoryRoot } from "translation-core/paths";
import { auditTranslations } from "./operations/audit-translations.ts";
import { cliContext } from "./operations/cli.ts";
const { positionals } = cliOptions();
if (positionals.length < 2) {
  console.error(
    `Usage: ${basename(process.argv[1])} PAGE.html DICTIONARY.json [DICTIONARY.json ...]`,
  );
  process.exitCode = 2;
} else {
  const [html, ...dictionaries] = await Promise.all(
    positionals.map((path) => readFile(resolve(repositoryRoot, path), "utf8")),
  );
  const result = await auditTranslations(
    cliContext(),
    html,
    dictionaries.map((value) => JSON.parse(value)),
  );
  for (const item of result.items) console.log(item.message);
}
