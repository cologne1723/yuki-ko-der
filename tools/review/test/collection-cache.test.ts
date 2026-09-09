import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createReviewApp } from "../src/review-server.ts";
import { fixture } from "./collection-fixture.ts";
import { createZip } from "../../ui-collector/src/export.ts";
import { reactPage } from "./react-fixture.ts";

test(
  "upload and deletion refresh a previously visited glossary with production cache settings",
  { timeout: 30000 },
  async (t) => {
    const root = await mkdtemp(
      join(process.cwd(), "data/stray/collection-cache-"),
    );
    t.after(() => rm(root, { recursive: true, force: true }));
    await mkdir(join(root, "translations/ko"), { recursive: true });
    await writeFile(
      join(root, "translations/ko.messages.json"),
      JSON.stringify({
        messages: [
          {
            id: "known",
            source: "日本語",
            target: "한국어",
            reviewStatus: "unreviewed",
          },
        ],
      }),
    );
    await writeFile(
      join(root, "translations/ko/main.json"),
      JSON.stringify({ translations: [{ ref: "known", selector: "button" }] }),
    );
    const app = createReviewApp({ repositoryRoot: root, assetRoot: root });
    let glossaryRequests = 0;
    const p = reactPage(
      t,
      async (path, init) => {
        if (path === "/api/ui") glossaryRequests++;
        const body =
          init?.body && typeof (init.body as Blob).arrayBuffer === "function"
            ? new Uint8Array(await (init.body as Blob).arrayBuffer())
            : init?.body;
        return app.request(`http://localhost${path}`, {
          ...init,
          body,
          headers: {
            ...Object.fromEntries(new Headers(init?.headers)),
            host: "localhost",
          },
        });
      },
      "/ui#main.json:0",
      "ui",
    );
    await p.screen.findByLabelText("한국어 번역");
    assert.equal(p.cachedUi().pages.length, 0);
    await p.navigate("/ui?view=imports");
    await p.screen.findByLabelText("수집한 ZIP 파일");
    const archive = fixture();
    archive.occurrences[0].category = "interface";
    archive.occurrences[0].liveCssSelectorHint = "button";
    const bytes = createZip(archive);
    const file = new p.dom.window.File(
      [Uint8Array.from(bytes).buffer],
      "one.zip",
      { type: "application/zip" },
    );
    Object.defineProperty(file, "arrayBuffer", {
      value: async () => Uint8Array.from(bytes).buffer,
    });
    await p.user.upload(
      p.dom.window.document.querySelector("input[type=file]"),
      file,
    );
    await p.user.click(
      p.screen.getByRole("button", { name: "가져오기", exact: true }),
    );
    await p.screen.findByText("one.zip: 가져오기 완료", {}, { timeout: 10000 });
    await p.screen.findByLabelText("한국어 번역");
    await p.navigate("/ui#main.json:0");
    await p.waitFor(() =>
      assert.equal(p.screen.queryByLabelText("수집한 ZIP 파일") === null, true),
    );
    await p.screen.findByLabelText("한국어 번역");
    const server = await (
      await app.request("http://localhost/api/ui", {
        headers: { host: "localhost" },
      })
    ).json();

    assert.equal(server.pages.length, 1);
    await p.waitFor(() => assert.equal(p.cachedUi().pages.length, 1));
    assert.equal(glossaryRequests, 2);
    const collections = await (
      await app.request("http://localhost/api/ui/imports", {
        headers: { host: "localhost" },
      })
    ).json();
    await p.navigate(
      "/ui?view=imports&collection=" + collections.collections[0].id,
    );
    await p.user.click(
      await p.screen.findByRole("button", { name: "자료 삭제", exact: true }),
    );
    const dialog = await p.screen.findByRole("dialog");
    await p.user.click(
      p.within(dialog).getByRole("button", { name: "자료 삭제", exact: true }),
    );
    await p.waitFor(() =>
      assert.equal(
        p.dom.window.document.querySelector("[role=dialog]") === null,
        true,
      ),
    );
    await p.waitFor(() =>
      assert.equal(
        p.screen.getByRole("button", { name: "자료 삭제", exact: true })
          .disabled,
        true,
      ),
    );
    await p.waitFor(() =>
      assert.equal(p.screen.queryByLabelText("한국어 번역") === null, true),
    );
    await p.navigate("/ui#main.json:0");
    await p.waitFor(() =>
      assert.equal(p.screen.queryByLabelText("수집한 ZIP 파일") === null, true),
    );
    await p.screen.findByLabelText("한국어 번역");
    await p.waitFor(() => assert.equal(p.cachedUi().pages.length, 0));
    assert.equal(glossaryRequests, 3);
  },
);
