import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { bindPreviewLinks } from "../public/app/preview-links.ts";

test("sandboxed preview anchors scroll locally, decode IDs and detach on replacement", () => {
  const sourceUrl = "https://yukicoder.me/problems/no/42";
  const dom = new JSDOM(
    `<a href="#%ED%95%9C%EA%B8%80">local</a><a href="${sourceUrl}#%ED%95%9C%EA%B8%80">absolute</a><a href="43#other">external</a><a href="#%FF">malformed</a><a href="#">top</a><h4 id="한글">Heading</h4>`,
    { url: sourceUrl },
  );
  const doc = dom.window.document;
  let scrolled = 0;
  doc.getElementById("한글")!.scrollIntoView = () => {
    scrolled++;
  };
  const detach = bindPreviewLinks(doc, sourceUrl);
  const links = doc.querySelectorAll("a");
  const click = (index: number, options: MouseEventInit = {}) => {
    const event = new dom.window.MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      ...options,
    });
    // Dispatching through a child exercises delegated link lookup.
    const span = doc.createElement("span");
    links[index].append(span);
    span.dispatchEvent(event);
    return event.defaultPrevented;
  };
  assert.equal(click(0), true);
  assert.equal(click(1), true);
  assert.equal(scrolled, 2);
  assert.equal(click(2), false);
  assert.equal(click(0, { ctrlKey: true }), false);
  assert.equal(click(3), true);
  doc.documentElement.scrollTop = 450;
  assert.equal(click(4), true);
  assert.equal(doc.documentElement.scrollTop, 0);
  detach();
  assert.equal(click(0), false);
  assert.equal(scrolled, 2);
  dom.window.close();
});
