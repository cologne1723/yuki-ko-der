import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

// Exact source snapshots: gzip/base64 avoids formatting the hash-bound HTML.
const snapshots: Record<string, string> = JSON.parse(
  readFileSync(
    new URL("./fixtures/source-corrections.json", import.meta.url),
    "utf8",
  ),
);

export function sourceCorrectionFixture(problemNo: number): string {
  const snapshot = snapshots[String(problemNo)];
  if (!snapshot) throw new Error(`Missing source fixture: ${problemNo}`);
  return gunzipSync(Buffer.from(snapshot, "base64")).toString("utf8");
}
