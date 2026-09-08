import assert from "node:assert/strict";
import test from "node:test";
import { Hono } from "hono";
import { jsonBody, problemSaveSchema } from "../src/request-schemas.ts";

test("validated JSON routes preserve requests without a JSON content-type", async () => {
  const app = new Hono().post("/", jsonBody(problemSaveSchema), (c) =>
    c.json(c.req.valid("json")),
  );
  app.onError((_error, c) => c.json({ error: "Invalid body" }, 400));
  for (const contentType of [
    undefined,
    "text/plain",
    "application/json",
    "application/json; charset=utf-8",
    "application/vnd.example.v1+json",
  ]) {
    const value = { html: "<p>sample</p>", revision: "revision" };
    const response = await app.request("http://localhost/", {
      method: "POST",
      headers: contentType ? { "Content-Type": contentType } : {},
      body: new TextEncoder().encode(JSON.stringify(value)),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), value);
  }
  const invalid = await app.request("http://localhost/", {
    method: "POST",
    body: "{",
  });
  assert.equal(invalid.status, 400);
});
