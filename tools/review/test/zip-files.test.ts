import assert from "node:assert/strict";
import test from "node:test";
import { Uint8ArrayReader, Uint8ArrayWriter, ZipWriter } from "@zip.js/zip.js";
import { readZipFiles } from "../src/zip-files.ts";

test("ordinary ZIP comments and directory records remain readable", async () => {
  const writer = new ZipWriter(new Uint8ArrayWriter(), {
    useWebWorkers: false,
  });
  await writer.add("evidence/", undefined, { directory: true });
  await writer.add(
    "evidence/example.txt",
    new Uint8ArrayReader(new TextEncoder().encode("sample\r\n")),
  );
  const bytes = await writer.close(new TextEncoder().encode("archive comment"));
  const files = await readZipFiles(bytes);
  assert.equal(files.get("evidence/")?.length, 0);
  assert.equal(
    new TextDecoder().decode(files.get("evidence/example.txt")),
    "sample\r\n",
  );
});

test("ZIP64 is rejected even when its entry sizes fit ordinary ZIP fields", async () => {
  const writer = new ZipWriter(new Uint8ArrayWriter(), {
    useWebWorkers: false,
    zip64: true,
  });
  await writer.add("example.txt", new Uint8ArrayReader(new Uint8Array([1])));
  await assert.rejects(readZipFiles(await writer.close()), /Unsupported/);
});
