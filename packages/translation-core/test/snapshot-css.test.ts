import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeSnapshotCss } from "../src/snapshot-css.ts";

test("snapshot CSS removes escaped and indirect resource declarations while preserving layout", () => {
  const output = sanitizeSnapshotCss(String.raw`
    @import "https://example.test/import.css";
    @font-face { font-family: remote; src: url(https://example.test/font); }
    @media (min-width: 1px) {
      .card { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));
        color: rgb(1, 2, 3); transform: translateX(2px);
        background: u\72l("https://example.test/background");
        --image: url("https://example.test/custom");
        border-image: image-set("https://example.test/image" 1x);
      }
    }
  `);
  assert.doesNotMatch(output, /example|@import|@font-face|--image|image-set/);
  assert.match(output, /display:grid/);
  assert.match(output, /repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(output, /color:rgb\(1,2,3\)/);
  assert.match(output, /translateX\(2px\)/);
  assert.equal(
    sanitizeSnapshotCss('color:red;background:url("unterminated', true),
    "color:red",
  );
});
