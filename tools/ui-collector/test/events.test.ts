import cssEscape from "css.escape";
import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { EventRecorder } from "../src/events.ts";

test("records ordered control state and schedules interaction scans", () => {
  const dom = new JSDOM(
    `<button id="run" aria-label="실행">일본어</button><input value="secret">`,
    { url: "https://yukicoder.me/" },
  );
  Object.assign(globalThis, {
    CSS: { escape: cssEscape },
    window: dom.window,
    Element: dom.window.Element,
  });
  const callbacks: string[] = [];
  const recorder = new EventRecorder(
    "session",
    "document",
    () => 100,
    (event) => callbacks.push(event.type),
  );
  recorder.start(dom.window.document);
  dom.window.document
    .querySelector("button")!
    .dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  recorder.stop();

  const event = recorder.all()[0]!;
  assert.equal(event.type, "click");
  assert.equal(event.sequence, 1);
  assert.equal(event.controlState?.valuePresent, true);
  assert.deepEqual(callbacks, ["click"]);
  assert.equal(recorder.preceding(100)[0]?.eventId, event.eventId);
  const input = dom.window.document.querySelector("input")!;
  input.id = "csrf-private-value";
  const sensitive = recorder.record("change", input);
  assert.equal(sensitive.target.id, undefined);
  assert.equal(sensitive.target.locator, "input");
  assert.doesNotMatch(JSON.stringify(sensitive), /secret|csrf-private-value/);
  input.id = "123:control";
  const escaped = recorder.record("change", input);
  assert.ok(escaped.target.locator);
  assert.equal(
    dom.window.document.querySelector(escaped.target.locator),
    input,
  );
  dom.window.close();
});

test("hover entry follows nested controls without changing propagation or duplicating listeners", () => {
  const dom = new JSDOM(
    '<button><span>実行</span><strong>する</strong></button><input value="private draft">',
  );
  Object.assign(globalThis, {
    CSS: { escape: cssEscape },
    window: dom.window,
    Element: dom.window.Element,
  });
  const recorder = new EventRecorder("session", "document");
  const button = dom.window.document.querySelector("button")!;
  const span = button.querySelector("span")!;
  const strong = button.querySelector("strong")!;
  let propagated = 0;
  button.addEventListener("mouseover", () => propagated++);
  recorder.start(dom.window.document);
  recorder.start(dom.window.document);
  const enter = new dom.window.MouseEvent("mouseover", {
    bubbles: true,
    cancelable: true,
  });
  span.dispatchEvent(enter);
  strong.dispatchEvent(
    new dom.window.MouseEvent("mouseover", {
      bubbles: true,
      relatedTarget: span,
    }),
  );
  assert.equal(recorder.all().length, 1);
  assert.equal(recorder.all()[0].target.tagName, "button");
  assert.equal(propagated, 2);
  assert.equal(enter.defaultPrevented, false);
  assert.equal(
    dom.window.document.querySelector("input")!.value,
    "private draft",
  );
  recorder.stop();
  span.dispatchEvent(new dom.window.MouseEvent("mouseover", { bubbles: true }));
  assert.equal(recorder.all().length, 1);
  recorder.start(dom.window.document);
  span.dispatchEvent(new dom.window.MouseEvent("mouseover", { bubbles: true }));
  assert.equal(recorder.all().length, 2);
  recorder.stop();
  dom.window.close();
});

test("preceding context excludes old, future and previous-document events and never exceeds twenty", () => {
  const dom = new JSDOM("<button>実行</button>");
  const button = dom.window.document.querySelector("button")!;
  let now = 0;
  const recorder = new EventRecorder("session", "first", () => now);
  recorder.record("click", button);
  assert.equal(recorder.preceding(10_000).length, 1);
  now = 10_001;
  assert.equal(recorder.preceding(now).length, 0);
  for (let i = 0; i < 25; i++) {
    now++;
    recorder.record("click", button);
  }
  const cutoff = now;
  now++;
  recorder.record("change", button);
  const context = recorder.preceding(cutoff, 100);
  assert.equal(context.length, 20);
  assert.ok(context.every((event) => event.timestamp <= cutoff));
  assert.equal(context.at(-1)!.timestamp, cutoff);
  assert.equal(recorder.preceding(cutoff, 0).length, 0);
  recorder.setDocument("second");
  assert.deepEqual(recorder.preceding(now), []);
  const next = recorder.record("navigation", button);
  assert.equal(next.documentId, "second");
  assert.equal(next.sequence, 1);
  dom.window.close();
});

test("focus, change, submission, disclosure and navigation remain passive across restart", () => {
  const dom = new JSDOM(
    '<form><input type="checkbox" checked><input value="private draft"></form><details open><summary>説明</summary></details>',
    {
      url: "https://yukicoder.me/",
    },
  );
  Object.assign(globalThis, {
    CSS: { escape: cssEscape },
    window: dom.window,
    Element: dom.window.Element,
  });
  const recorder = new EventRecorder("session", "document");
  const doc = dom.window.document;
  const checkbox = doc.querySelector("input")!;
  const form = doc.querySelector("form")!;
  const details = doc.querySelector("details")!;
  const requests: Array<[Element, string]> = [
    [checkbox, "focusin"],
    [checkbox, "change"],
    [form, "submit"],
    [details, "toggle"],
  ];
  try {
    for (let round = 0; round < 2; round++) {
      recorder.start(doc);
      for (const [element, type] of requests) {
        let propagated = false;
        element.addEventListener(
          type,
          () => {
            propagated = true;
          },
          { once: true },
        );
        const event = new dom.window.Event(type, {
          bubbles: true,
          cancelable: true,
        });
        assert.equal(element.dispatchEvent(event), true);
        assert.equal(propagated, true);
        assert.equal(event.defaultPrevented, false);
      }
      dom.window.dispatchEvent(new dom.window.PopStateEvent("popstate"));
      dom.window.dispatchEvent(new dom.window.HashChangeEvent("hashchange"));
      recorder.stop();
      const recorded = recorder.all();
      assert.equal(recorded.length, (round + 1) * 6);
      assert.deepEqual(
        recorded.slice(-6).map((event) => event.type),
        ["focus", "change", "submit", "disclosure", "navigation", "navigation"],
      );
      assert.equal(recorded.at(-5)!.controlState?.checked, true);
      assert.equal(recorded.at(-3)!.controlState?.expanded, true);
      assert.equal(recorded.at(-1)!.controlState, undefined);
      dom.window.dispatchEvent(new dom.window.PopStateEvent("popstate"));
      checkbox.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
      assert.equal(recorder.all().length, recorded.length);
    }
    assert.equal(checkbox.checked, true);
    assert.equal(doc.querySelectorAll("input")[1].value, "private draft");
    assert.doesNotMatch(JSON.stringify(recorder.all()), /private draft/);
  } finally {
    recorder.stop();
    dom.window.close();
  }
});
