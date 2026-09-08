import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { serializeSanitized } from "../src/sanitize.ts";

test("sanitizes executable and secret content without touching the live DOM", async () => {
  const dom = new JSDOM(
    `<main onclick="bad()"><script>alert(1)</script><iframe src="https://secret.example"></iframe><input name="password" value="do-not-save"><button title="日本語">日本語</button></main>`,
  );
  const original = dom.window.document.documentElement.outerHTML;
  const snapshot = await serializeSanitized(dom.window.document);
  assert.equal(dom.window.document.documentElement.outerHTML, original);
  assert.doesNotMatch(
    snapshot.html,
    /<script|<iframe|onclick=|password|do-not-save/iu,
  );
  assert.match(snapshot.html, /日本語/u);
  assert.ok(snapshot.redaction.removedElements >= 2);
});

test("removes secret meta values and editable drafts from the saved clone", async () => {
  const dom = new JSDOM(`
    <meta name="csrf-token" content="secret-csrf-value">
    <input type="password" value="secret-password">
    <input name="api_key" value="secret-api-value">
    <div contenteditable="plaintext-only"><p>private editable draft</p></div>
    <div contenteditable="false">Read-only label</div>
    <textarea>private textarea draft</textarea>
  `);
  const original = dom.window.document.documentElement.outerHTML;
  const snapshot = await serializeSanitized(dom.window.document);
  assert.doesNotMatch(snapshot.html, /secret-|private /u);
  assert.equal(
    snapshot.clone.querySelector("[contenteditable]")!.textContent,
    "",
  );
  assert.match(snapshot.html, /Read-only label/u);
  assert.equal(dom.window.document.documentElement.outerHTML, original);
});

test("preserves control labels and current selection without saving editable values", async () => {
  const dom = new JSDOM(`
    <input type="submit" value="送信">
    <input type="button" value="実行">
    <input type="reset" value="リセット">
    <input id="check" type="checkbox">
    <input id="radio" type="radio" checked>
    <input id="text" value="private initial input">
    <select><option selected>最初</option><option>次の選択</option></select>
    <details><summary>詳細</summary>More information</details>
  `);
  const doc = dom.window.document;
  doc.querySelector<HTMLInputElement>("input[type=submit]")!.value = "送信する";
  doc.querySelector<HTMLInputElement>("#check")!.checked = true;
  doc.querySelector<HTMLInputElement>("#radio")!.checked = false;
  doc.querySelector<HTMLInputElement>("#text")!.value = "private current input";
  doc.querySelector("select")!.selectedIndex = 1;
  doc.querySelector("details")!.open = true;

  const snapshot = await serializeSanitized(doc);
  const saved = new JSDOM(snapshot.html).window.document;
  assert.equal(
    saved.querySelector<HTMLInputElement>("input[type=submit]")!.value,
    "送信する",
  );
  assert.equal(
    saved.querySelector<HTMLInputElement>("input[type=button]")!.value,
    "実行",
  );
  assert.equal(
    saved.querySelector<HTMLInputElement>("input[type=reset]")!.value,
    "リセット",
  );
  assert.equal(saved.querySelector<HTMLInputElement>("#check")!.checked, true);
  assert.equal(saved.querySelector<HTMLInputElement>("#radio")!.checked, false);
  assert.equal(saved.querySelector("select")!.selectedIndex, 1);
  assert.equal(
    saved.querySelector("select")!.options[1]!.textContent,
    "次の選択",
  );
  assert.equal(saved.querySelector("details")!.open, true);
  assert.doesNotMatch(snapshot.html, /private /u);
  assert.equal(
    doc.querySelector<HTMLInputElement>("#text")!.value,
    "private current input",
  );
  assert.equal(doc.querySelector("select")!.selectedIndex, 1);
});

test("strips loading attributes and embeds a policy in standalone snapshots", async () => {
  const dom = new JSDOM(`
    <head>
      <meta http-equiv="Content-Security-Policy" content="default-src *">
      <meta http-equiv="refresh" content="0; url=https://example.test">
      <link rel="dns-prefetch" href="https://example.test">
      <style>@import "https://example.test/a.css"; p { background: url(https://example.test/b.png) }</style>
    </head>
    <body background="https://example.test/c.png">
      <picture><source srcset="https://example.test/d.png 1x"><img src="https://example.test/e.png" srcset="https://example.test/f.png 2x"></picture>
      <svg><image xlink:href="https://example.test/g.png"></image></svg>
      <video poster="https://example.test/h.png"><source src="https://example.test/i.mp4"></video>
      <form action="https://example.test/post"><button formaction="https://example.test/other">Send</button></form>
      <a href="https://example.test" ping="https://example.test/ping">Link</a>
      <template><script>bad()</script></template>
    </body>
  `);
  const snapshot = await serializeSanitized(dom.window.document);
  assert.doesNotMatch(snapshot.html, /example\.test|<script|<template|<link/u);
  const policies = snapshot.clone.querySelectorAll("meta[http-equiv]");
  assert.equal(policies.length, 1);
  assert.equal(snapshot.clone.head.firstElementChild, policies[0]);
  assert.equal(
    policies[0]!.getAttribute("http-equiv"),
    "Content-Security-Policy",
  );
  const policy = policies[0]!.getAttribute("content")!;
  assert.match(policy, /default-src 'none'/u);
  assert.match(policy, /script-src 'none'/u);
  assert.match(policy, /base-uri 'none'/u);
  assert.match(policy, /form-action 'none'/u);
});
