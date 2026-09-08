import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const run = promisify(execFile);

test("conversion no-op and audit usage keep their existing exit codes", async () => {
  const conversion = await run(process.execPath, [
    "--import",
    "tsx",
    fileURLToPath(
      new URL("../src/convert-problem-html-to-mdx.ts", import.meta.url),
    ),
  ]);
  assert.equal(conversion.stdout, "");
  await assert.rejects(
    run(process.execPath, [
      "--import",
      "tsx",
      fileURLToPath(new URL("../src/audit-translations.ts", import.meta.url)),
    ]),
    (error: unknown) => {
      assert.ok(
        error &&
          typeof error === "object" &&
          "code" in error &&
          "stderr" in error,
      );
      assert.equal(error.code, 2);
      assert.match(String(error.stderr), /Usage:/);
      return true;
    },
  );
});
