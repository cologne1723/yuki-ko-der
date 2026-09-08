import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { format } from "prettier";
import {
  catalogSchema,
  dictionarySchema,
} from "translation-core/catalog-schema";
import { z } from "translation-core/validation";

const root = fileURLToPath(new URL("../", import.meta.url));
for (const [file, schema] of [
  ["translations/messages.schema.json", catalogSchema],
  ["translations/translations.schema.json", dictionarySchema],
] as const) {
  const output = await format(JSON.stringify(z.toJSONSchema(schema)), {
    parser: "json",
  });
  const path = resolve(root, file);
  if (process.argv.includes("--check")) {
    if ((await readFile(path, "utf8")) !== output)
      throw new Error(`${file} is out of date; run pnpm schemas:generate`);
  } else await writeFile(path, output);
}
