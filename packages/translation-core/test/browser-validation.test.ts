import assert from "node:assert/strict";
import test from "node:test";
import { createContext, runInContext } from "node:vm";
import { build } from "esbuild";

test("browser validation works with string code generation forbidden by CSP", async () => {
  const bundle = await build({
    stdin: {
      contents: `import { z } from "./packages/translation-core/src/validation.ts";
        import { metadataSchema } from "./packages/translation-core/src/problem-schema.ts";
        export const result = z.object({ rows: z.array(z.object({ name: z.string() })) }).parse({ rows: [{ name: "valid" }] });
        export const rejected = !metadataSchema.safeParse({ schemaVersion: 1 }).success;`,
      resolveDir: process.cwd(),
      loader: "ts",
    },
    bundle: true,
    platform: "browser",
    format: "iife",
    globalName: "validationProbe",
    write: false,
  });
  const context: {
    validationProbe?: {
      result: { rows: { name: string }[] };
      rejected: boolean;
    };
  } = {};
  createContext(context, { codeGeneration: { strings: false, wasm: false } });
  assert.throws(
    () => runInContext('new Function("return 1")()', context),
    /Code generation from strings disallowed/,
  );
  runInContext(bundle.outputFiles[0].text, context);
  assert.equal(context.validationProbe?.result.rows[0].name, "valid");
  assert.equal(context.validationProbe?.rejected, true);
});
