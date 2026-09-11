import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applicableGlossary } from "translation-core/problem-glossary";

const glossaryPath = fileURLToPath(
  new URL("../problem-translations/glossary.yaml", import.meta.url),
);
const args = process.argv.slice(2).filter((arg) => arg !== "--");
if (args.length !== 1) {
  console.error("usage: pnpm glossary -- PATH");
  process.exit(2);
}
try {
  const source = readFileSync(resolve(args[0]), "utf8");
  if (existsSync(glossaryPath)) {
    const entries = applicableGlossary(
      readFileSync(glossaryPath, "utf8"),
      source,
    );
    if (entries.length) console.log(JSON.stringify(entries, null, 2));
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
