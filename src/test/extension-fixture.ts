import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { extensionMessageIds } from "../extension-message-ids.ts";

const catalog = JSON.parse(
  await readFile("translations/ko.messages.json", "utf8"),
);
const messages = Object.fromEntries(
  Object.entries(extensionMessageIds).map(([key, id]) => [
    key,
    catalog.messages.find((m: { id: string }) => m.id === id).target,
  ]),
);
export async function bundle(
  entry: string,
  titles: unknown[] = [],
): Promise<string> {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: "iife",
    define: {
      __YUKICODER_PROBLEM_TITLES__: JSON.stringify(titles),
      __YUKICODER_EXTENSION_MESSAGES__: JSON.stringify(messages),
    },
  });
  return result.outputFiles[0].text;
}
export const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise<void>((r) => setImmediate(r));
};
export function page(html: string, url = "https://yukicoder.me/problems/no/1") {
  const dom = new JSDOM(`<!doctype html>${html}`, {
    url,
    runScripts: "outside-only",
  });
  Object.defineProperty(dom.window, "crypto", { value: crypto });
  Object.assign(dom.window, {
    Response,
    TextEncoder,
    TextDecoder,
    AbortController,
  });
  const close = () => {
    dom.window.dispatchEvent(new dom.window.Event("pagehide"));
    dom.window.close();
  };
  return { dom, close };
}
