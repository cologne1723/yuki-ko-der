import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { bundle, settle } from "./extension-fixture.ts";
const code = await bundle("src/background.ts");

test("translator background serves only its fixed catalog to supported content scripts and serializes toggles", async () => {
  let listener!: (
    request: unknown,
    sender: unknown,
    reply: (result: any) => void,
  ) => void;
  let click!: () => void;
  const saved: Record<string, unknown> = {};
  const badges: string[] = [];
  let requests = 0;
  let broken = false;
  const catalog = { schemaVersion: 1, revision: "a".repeat(64), entries: [] };
  const api = {
    action: {
      setBadgeBackgroundColor: async () => {},
      setBadgeTextColor: async () => {},
      setBadgeText: async ({ text }: { text: string }) => {
        badges.push(text);
      },
      setTitle: async () => {},
      onClicked: {
        addListener: (fn: typeof click) => {
          click = fn;
        },
      },
    },
    runtime: {
      id: "translator",
      onInstalled: { addListener() {} },
      onStartup: { addListener() {} },
      onMessage: {
        addListener: (fn: typeof listener) => {
          listener = fn;
        },
      },
    },
    storage: {
      local: {
        get: async (key: string | null) =>
          key === null ? { ...saved } : { [key]: saved[key] },
        remove: async (keys: string | string[]) => {
          for (const key of Array.isArray(keys) ? keys : [keys])
            delete saved[key];
        },
        set: async (values: Record<string, unknown>) => {
          if (broken) throw new Error("storage failed");
          Object.assign(saved, values);
        },
      },
      onChanged: { addListener() {} },
    },
  };
  runInNewContext(code, {
    chrome: api,
    console: { error() {}, warn() {} },
    URL,
    TextEncoder,
    crypto,
    Response,
    AbortController,
    setTimeout,
    clearTimeout,
    fetch: async (url: string) => {
      assert.equal(
        url,
        "https://cologne1723.github.io/yuki-ko-der/ko/problem-catalog.json",
      );
      requests++;
      return Response.json(catalog);
    },
  });
  const call = (url: string) =>
    new Promise<any>((resolve) =>
      listener(
        { type: "problem-catalog:get", url: "https://untrusted.test/" },
        { id: "translator", url },
        resolve,
      ),
    );
  assert.equal((await call("https://untrusted.test/")).ok, false);
  assert.equal(requests, 0);
  const [first, second] = await Promise.all([
    call("https://yukicoder.me/"),
    call("https://yukicoder.me/problems"),
  ]);
  assert.equal(requests, 1);
  assert.deepEqual(first, second);
  assert.equal(first.source, "remote");
  click();
  click();
  await settle();
  assert.equal(saved.translationEnabled, true);
  assert.equal(badges.at(-1), "KO");
  broken = true;
  click();
  await settle();
  assert.equal(badges.at(-1), "!");
  broken = false;
  click();
  await settle();
  assert.equal(badges.at(-1), "JA");
});
