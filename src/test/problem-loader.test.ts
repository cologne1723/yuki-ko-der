import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  createProblemLoader,
  ProblemVerificationError,
} from "../problem-loader.ts";
import { page } from "./extension-fixture.ts";

const source =
  '<div class="block"><h4>問題文</h4><p>Source statement</p></div>';
const metadata = { No: 1, ProblemId: 18, Title: "題名" };
function fixture(metadataBody: unknown = metadata, html: BodyInit = source) {
  const { dom, close } = page("");
  dom.window.fetch = async (url) =>
    String(url).endsWith("/html")
      ? new Response(html)
      : new Response(JSON.stringify(metadataBody));
  const loader = createProblemLoader(
    dom.window as unknown as Window & typeof globalThis,
  );
  const digest = createHash("sha256").update(source).digest("hex");
  const translation = loader.parseTranslationDocument(
    `<main data-yukicoder-ko-problem data-schema-version="1" data-locale="ko" data-problem-no="1" data-problem-id="18" data-source-title="題名" data-source-html-sha256="${digest}"><h3>제목</h3><div class="problem-statement"><div class="block">Statement</div></div></main>`,
    1,
    "18",
  );
  return {
    dom,
    close,
    verify: () => loader.verifyCanonicalSource(translation),
  };
}

for (const invalid of [
  null,
  [],
  {},
  { error: "rate limited" },
  { ...metadata, No: "1" },
  { ...metadata, No: 0 },
  { ...metadata, ProblemId: -18 },
  { ...metadata, ProblemId: 18.5 },
  { ...metadata, ProblemId: Number.MAX_SAFE_INTEGER + 1 },
  { ...metadata, Title: null },
  { ...metadata, Title: "  " },
]) {
  test(`invalid HTTP 200 metadata is unavailable: ${JSON.stringify(invalid)}`, async () => {
    const f = fixture(invalid);
    try {
      await assert.rejects(
        f.verify,
        (error: unknown) =>
          error instanceof Error &&
          !(error instanceof ProblemVerificationError),
      );
    } finally {
      f.close();
    }
  });
}

for (const invalid of [
  "",
  "Internal server error",
  '{"error":"rate limited"}',
  "<!doctype html><html><body><form>Sign in</form></body></html>",
  '<div class="block"></div>',
  '<div class="sample"><pre>1</pre></div>',
  new Uint8Array([0xff, 0xfe]),
]) {
  test(`invalid HTTP 200 statement is unavailable: ${String(invalid)}`, async () => {
    // Even valid changed metadata cannot turn an invalid body into "changed".
    const f = fixture({ ...metadata, Title: "Changed" }, invalid);
    try {
      await assert.rejects(
        f.verify,
        (error: unknown) =>
          error instanceof Error &&
          !(error instanceof ProblemVerificationError),
      );
    } finally {
      f.close();
    }
  });
}

for (const changed of [
  { ...metadata, No: 2 },
  { ...metadata, ProblemId: 19 },
  { ...metadata, Title: "New title" },
]) {
  test(`valid metadata identity differences are changed: ${JSON.stringify(changed)}`, async () => {
    const f = fixture(changed);
    try {
      await assert.rejects(
        f.verify,
        (error: unknown) =>
          error instanceof ProblemVerificationError &&
          error.sourceHtml === source,
      );
    } finally {
      f.close();
    }
  });
}

test("valid raw bytes verify and changed raw bytes retain the canonical source", async () => {
  const f = fixture();
  try {
    assert.equal(await f.verify(), source);
    const changed = source.replace("Source", "Changed");
    f.dom.window.fetch = async (url) =>
      String(url).endsWith("/html")
        ? new Response(changed)
        : Response.json(metadata);
    await assert.rejects(
      f.verify,
      (error: unknown) =>
        error instanceof ProblemVerificationError &&
        error.sourceHtml === changed,
    );
  } finally {
    f.close();
  }
});

test("malformed HTTP 200 JSON is unavailable rather than changed", async () => {
  const f = fixture();
  f.dom.window.fetch = async (url) =>
    new Response(String(url).endsWith("/html") ? source : "not JSON");
  try {
    await assert.rejects(
      f.verify,
      (error: unknown) =>
        error instanceof Error && !(error instanceof ProblemVerificationError),
    );
  } finally {
    f.close();
  }
});

test("verification waits for the other request after one API request fails", async () => {
  const f = fixture();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  f.dom.window.fetch = async (url) => {
    if (!String(url).endsWith("/html")) throw new Error("offline");
    await gate;
    return new Response(source);
  };
  try {
    let settled = false;
    const result = f.verify().catch((error: unknown) => {
      settled = true;
      return error;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(settled, false);
    release();
    assert.match(String(await result), /offline/);
  } finally {
    release();
    f.close();
  }
});
