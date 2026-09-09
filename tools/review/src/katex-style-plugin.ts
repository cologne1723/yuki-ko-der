import type { Plugin } from "esbuild";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

/** Embed the same CSS and fonts in each isolated preview document. */
export const katexStylePlugin: Plugin = {
  name: "preview-katex-style",
  setup(build) {
    build.onResolve({ filter: /^katex\/dist\/katex.min.css\?inline$/ }, () => ({
      path: createRequire(import.meta.url).resolve("katex/dist/katex.min.css"),
      namespace: "preview-katex",
    }));
    build.onLoad(
      { filter: /.*/, namespace: "preview-katex" },
      async ({ path }) => {
        let css = await readFile(path, "utf8");
        const urls = [
          ...new Set(
            [...css.matchAll(/url\((fonts\/[^)]+)\)/g)].map(
              (match) => match[1],
            ),
          ),
        ];
        for (const url of urls) {
          const font = await readFile(join(dirname(path), url));
          const mime = url.endsWith("woff2")
            ? "font/woff2"
            : url.endsWith("woff")
              ? "font/woff"
              : "font/ttf";
          css = css.replaceAll(
            `url(${url})`,
            `url(data:${mime};base64,${font.toString("base64")})`,
          );
        }
        return { contents: css, loader: "text" };
      },
    );
  },
};
