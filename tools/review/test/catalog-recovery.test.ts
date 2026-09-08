import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout } from "node:timers/promises";
import { UiReviewStore } from "../src/ui-review.ts";

async function setup(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "catalog-recovery-"));
  await mkdir(join(root, "translations/ko"), { recursive: true });
  const catalog = '{"messages":[]}';
  const dictionary = '{"translations":[]}';
  await writeFile(join(root, "translations/ko.messages.json"), catalog);
  await writeFile(join(root, "translations/ko/main.json"), dictionary);
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, catalog, dictionary };
}
async function interruptedWriter(
  t: TestContext,
  root: string,
  kind: "import" | "draft",
) {
  const child = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      "--input-type=module",
      "--eval",
      `
    import fs from "node:fs";
    import { syncBuiltinESMExports } from "node:module";
    import { UiReviewStore } from ${JSON.stringify(new URL("../src/ui-review.ts", import.meta.url).href)};
    const root = ${JSON.stringify(root)};
    const rename = fs.rename;
    fs.rename = (from, to, callback) => {
      rename(from, to, error => {
        if (!error && to === fs.realpathSync(root + "/translations/ko.messages.json")) {
          process.send("catalog-replaced");
          process.once("message", () => callback(null));
        } else callback(error);
      });
    };
    syncBuiltinESMExports();
    const store = new UiReviewStore(root);
    if (${JSON.stringify(kind)} === "draft") {
      const options = await store.draftOptions("名前", "/");
      await store.createDraft("名前", "/", { file: "main.json", revision: options.files[0].revision, selector: "button", target: "이름" });
    } else {
      await store.catalogTransaction(async (state) => {
        state.catalog.messages.push({ id: "new_message", source: "名前", target: "이름", reviewStatus: "unreviewed" });
        state.dictionaries["main.json"].translations.push({ ref: "new_message", selector: "button" });
      });
    }
    process.disconnect();
  `,
    ],
    { stdio: ["ignore", "pipe", "pipe", "ipc"] },
  );
  let errors = "";
  child.stderr?.on("data", (chunk) => {
    errors += chunk;
  });
  const exited = once(child, "exit");
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null)
      child.kill("SIGKILL");
    await exited;
  });
  await Promise.race([
    once(child, "message").then(([message]) =>
      assert.equal(message, "catalog-replaced"),
    ),
    exited.then(() => {
      throw new Error(`Writer exited before fault injection: ${errors}`);
    }),
    setTimeout(15000, undefined, { ref: false }).then(() => {
      throw new Error(`Writer timed out: ${errors}`);
    }),
  ]);
  return { child, exited };
}
for (const kind of ["import", "draft"] as const) {
  test(
    `catalog ${kind} crash is recovered before a concurrent reader sees partial files`,
    { timeout: 20000 },
    async (t) => {
      const { root, catalog, dictionary } = await setup(t);
      const { child, exited } = await interruptedWriter(t, root, kind);
      assert.notEqual(
        await readFile(join(root, "translations/ko.messages.json"), "utf8"),
        catalog,
      );
      assert.equal(
        await readFile(join(root, "translations/ko/main.json"), "utf8"),
        dictionary,
      );
      const reader = new UiReviewStore(root, join(root, "different-corpus"));
      let finished = false;
      const reading = reader.list().then((result) => {
        finished = true;
        return result;
      });
      await setTimeout(75);
      assert.equal(
        finished,
        false,
        "reader waits for the live cross-process writer",
      );
      child.kill("SIGKILL");
      await exited;
      const result = await reading;
      assert.equal(result.dictionaries[0].entries.length, 0);
      assert.equal(
        await readFile(join(root, "translations/ko.messages.json"), "utf8"),
        catalog,
      );
      assert.equal(
        await readFile(join(root, "translations/ko/main.json"), "utf8"),
        dictionary,
      );
      await assert.rejects(
        readFile(join(root, "data/reports/review-catalog/replacement.json")),
        { code: "ENOENT" },
      );
      const options = await reader.draftOptions("名前", "/");
      await reader.createDraft("名前", "/", {
        file: "main.json",
        revision: options.files[0].revision,
        selector: "button",
        target: "이름",
      });
      assert.equal(
        (await reader.list()).dictionaries[0].entries[0].target,
        "이름",
      );
    },
  );
}
test(
  "catalog recovery preserves external edits and journal for inspection instead of rolling over them",
  { timeout: 20000 },
  async (t) => {
    const { root } = await setup(t);
    const { child, exited } = await interruptedWriter(t, root, "import");
    const partialCatalog = await readFile(
      join(root, "translations/ko.messages.json"),
      "utf8",
    );
    const external = '{"translations":[],"external":"keep me"}';
    await writeFile(join(root, "translations/ko/main.json"), external);
    child.kill("SIGKILL");
    await exited;
    const store = new UiReviewStore(root);
    await assert.rejects(store.catalogState(), /conflicts with external edits/);
    assert.equal(
      await readFile(join(root, "translations/ko/main.json"), "utf8"),
      external,
    );
    assert.equal(
      await readFile(join(root, "translations/ko.messages.json"), "utf8"),
      partialCatalog,
    );
    assert.ok(
      await readFile(
        join(root, "data/reports/review-catalog/replacement.json"),
      ),
    );
  },
);
test("catalog transaction rejects external edits before writing and retains unrelated files", async (t) => {
  const { root, catalog } = await setup(t);
  const store = new UiReviewStore(root);
  const external = '{"translations":[]}\n';
  await assert.rejects(
    store.catalogTransaction(async (state) => {
      state.catalog.messages.push({
        id: "new_message",
        source: "名前",
        target: "이름",
        reviewStatus: "unreviewed",
      });
      state.dictionaries["main.json"].translations.push({
        ref: "new_message",
        selector: "button",
      });
      await writeFile(join(root, "translations/ko/main.json"), external);
    }),
    /변경되었습니다/,
  );
  assert.equal(
    await readFile(join(root, "translations/ko.messages.json"), "utf8"),
    catalog,
  );
  assert.equal(
    await readFile(join(root, "translations/ko/main.json"), "utf8"),
    external,
  );
});
