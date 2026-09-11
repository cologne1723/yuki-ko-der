import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { compileProblemMarkdown } from "../src/problem-markdown.ts";
import { parseTranslationDocument } from "../src/problem-document.ts";
import { verifyProblemRenderMarkup } from "../src/problem-render-markup.ts";

const source = readFileSync("problem-translations/ko/problems/1.mdx", "utf8");
test("compiler versions generated markup independently of schema and source metadata", () => {
  const html = compileProblemMarkdown(source);
  const root = JSDOM.fragment(html).querySelector("main")!;
  assert.equal(root.getAttribute("data-render-markup-version"), "2");
  assert.equal(root.getAttribute("data-schema-version"), "1");
  assert.equal(verifyProblemRenderMarkup(root), "current");
});

test("document ingress rejects explicit incompatible versions without guessing unmarked provenance", () => {
  const html = compileProblemMarkdown(source);
  const id = JSDOM.fragment(html)
    .querySelector("main")!
    .getAttribute("data-problem-id")!;
  const parse = (html: string) => new JSDOM(html).window.document;
  for (const version of ["1", "3", ""])
    assert.throws(
      () =>
        parseTranslationDocument(
          html.replace(
            'data-render-markup-version="2"',
            `data-render-markup-version="${version}"`,
          ),
          1,
          id,
          parse,
        ),
      /Unsupported problem render markup/,
    );
  const legacy = html.replace('data-render-markup-version="2"', "");
  const result = parseTranslationDocument(legacy, 1, id, parse);
  assert.equal(verifyProblemRenderMarkup(result.root), "unversioned");
  assert.equal(result.root.hasAttribute("data-render-markup-version"), false);
});
