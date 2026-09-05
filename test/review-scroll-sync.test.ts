import { strict as assert } from "node:assert";
import test from "node:test";
import { mapHeadingScroll } from "../review/scroll-sync.ts";

test("heading scroll synchronization aligns corresponding headings", () => {
  const source = [0, 100, 300, 700, 900];
  const target = [0, 180, 420, 800, 1_000];

  assert.equal(mapHeadingScroll(100, source, target), 180);
  assert.equal(mapHeadingScroll(300, source, target), 420);
  assert.equal(mapHeadingScroll(700, source, target), 800);
});

test("heading scroll synchronization interpolates between headings", () => {
  const source = [0, 100, 300, 700, 900];
  const target = [0, 180, 420, 800, 1_000];

  assert.equal(mapHeadingScroll(200, source, target), 300);
  assert.equal(mapHeadingScroll(500, source, target), 610);
  assert.equal(mapHeadingScroll(-100, source, target), 0);
  assert.equal(mapHeadingScroll(1_200, source, target), 1_000);
});

test("heading scroll synchronization handles repeated bottom anchors", () => {
  assert.equal(
    mapHeadingScroll(800, [0, 200, 800, 800], [0, 300, 900, 900]),
    900,
  );
});
