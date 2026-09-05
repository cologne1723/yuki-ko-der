#!/usr/bin/env node

import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ProblemReviewStore, ReviewError } from "./problem-review.ts";

import { UiReviewStore } from "./ui-review.ts";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 4173;
const MAX_BODY_BYTES = 8 * 1024 * 1024;

interface ReviewRequestBody {
  html?: unknown;
  target?: unknown;
  action?: unknown;
  revision?: unknown;
}

function sendJson(
  response: ServerResponse,
  status: number,
  value: unknown,
): void {
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
  });
  response.end(`${JSON.stringify(value)}\n`);
}

async function readJson(request: IncomingMessage): Promise<ReviewRequestBody> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES)
      throw new ReviewError("Request body is too large", 413);
    chunks.push(buffer);
  }
  try {
    return JSON.parse(
      Buffer.concat(chunks).toString("utf8"),
    ) as ReviewRequestBody;
  } catch {
    throw new ReviewError("Request body must be valid JSON");
  }
}

function assertMutationOrigin(request: IncomingMessage): void {
  const origin = request.headers.origin;
  if (!origin) return;
  const expected = `http://${request.headers.host}`;
  if (origin !== expected)
    throw new ReviewError("Cross-origin writes are not allowed", 403);
}

function problemNumber(pathname: string, suffix = ""): number | undefined {
  const escapedSuffix = suffix.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = pathname.match(
    new RegExp(`^/api/problems/(\\d+)${escapedSuffix}$`, "u"),
  );
  return match ? Number(match[1]) : undefined;
}

async function serveFile(
  response: ServerResponse,
  path: string,
  contentType: string,
): Promise<void> {
  await access(path);
  response.writeHead(200, {
    "cache-control": "no-store",
    "content-security-policy":
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://yukicoder.me; frame-src 'self'; connect-src 'self'; img-src 'self' data: https://yukicoder.me; font-src 'self'",
    "content-type": contentType,
    "x-content-type-options": "nosniff",
  });
  createReadStream(path).pipe(response);
}

export function createReviewServer(options: {
  repositoryRoot: string;
  assetRoot: string;
}) {
  const store = new ProblemReviewStore(options.repositoryRoot);
  const uiStore = new UiReviewStore(options.repositoryRoot);
  return createServer(async (request, response) => {
    try {
      const url = new URL(
        request.url ?? "/",
        `http://${request.headers.host ?? "localhost"}`,
      );
      if (request.method === "GET" && url.pathname === "/api/ui") {
        sendJson(response, 200, await uiStore.list());
        return;
      }
      const page = url.pathname.match(
        /^\/api\/ui-pages\/([a-zA-Z0-9_-]+\.html)$/u,
      );
      if (request.method === "GET" && page) {
        sendJson(response, 200, { html: await uiStore.page(page[1]) });
        return;
      }
      const uiEntry = url.pathname.match(
        /^\/api\/ui\/([a-z0-9_]+\.json)\/(\d+)$/u,
      );
      if (request.method === "PUT" && uiEntry) {
        assertMutationOrigin(request);
        const body = await readJson(request);
        sendJson(
          response,
          200,
          await uiStore.save(uiEntry[1], Number(uiEntry[2]), body),
        );
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/problems") {
        sendJson(response, 200, { problems: await store.list() });
        return;
      }
      const loadNo = problemNumber(url.pathname);
      if (request.method === "GET" && loadNo !== undefined) {
        sendJson(response, 200, await store.get(loadNo));
        return;
      }
      const saveNo = problemNumber(url.pathname);
      const approveNo = problemNumber(url.pathname, "/approve");
      const unapproveNo = problemNumber(url.pathname, "/unapprove");
      if (
        (request.method === "PUT" && saveNo !== undefined) ||
        (request.method === "POST" && approveNo !== undefined) ||
        (request.method === "POST" && unapproveNo !== undefined)
      ) {
        assertMutationOrigin(request);
        const body = await readJson(request);
        if (
          typeof body.html !== "string" ||
          typeof body.revision !== "string"
        ) {
          throw new ReviewError("html and revision must be strings");
        }
        const selectedNo = saveNo ?? approveNo ?? unapproveNo!;
        const action =
          approveNo !== undefined
            ? "approve"
            : unapproveNo !== undefined
              ? "unapprove"
              : "save";
        sendJson(
          response,
          200,
          await store.save(selectedNo, body.html, body.revision, action),
        );
        return;
      }
      const staticFiles: Record<string, [string, string]> = {
        "/ui": ["ui.html", "text/html; charset=utf-8"],
        "/ui.js": ["ui.js", "text/javascript; charset=utf-8"],
        "/ui.css": ["ui.css", "text/css; charset=utf-8"],
        "/": ["index.html", "text/html; charset=utf-8"],
        "/client.js": ["client.js", "text/javascript; charset=utf-8"],
        "/client.js.map": ["client.js.map", "application/json; charset=utf-8"],
        "/styles.css": ["styles.css", "text/css; charset=utf-8"],
      };
      const staticFile = staticFiles[url.pathname];
      if (request.method === "GET" && staticFile) {
        await serveFile(
          response,
          join(options.assetRoot, staticFile[0]),
          staticFile[1],
        );
        return;
      }
      const katexAsset = url.pathname.match(
        /^\/katex\/(katex\.min\.css|fonts\/[A-Za-z0-9._-]+\.(?:woff2?|ttf))$/u,
      )?.[1];
      if (request.method === "GET" && katexAsset) {
        const extension = katexAsset.split(".").at(-1);
        const contentTypes: Record<string, string> = {
          css: "text/css; charset=utf-8",
          ttf: "font/ttf",
          woff: "font/woff",
          woff2: "font/woff2",
        };
        await serveFile(
          response,
          join(options.assetRoot, "katex", katexAsset),
          contentTypes[extension ?? ""] ?? "application/octet-stream",
        );
        return;
      }
      sendJson(response, 404, { error: "Not found" });
    } catch (error) {
      const status = error instanceof ReviewError ? error.statusCode : 500;
      const message = error instanceof Error ? error.message : String(error);
      sendJson(response, status, { error: message });
    }
  });
}

const isMain = process.argv[1]
  ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href
  : false;
if (isMain) {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const assetRoot = join(repositoryRoot, ".review-dist");
  const port = Number(process.env.YUKICODER_REVIEW_PORT ?? DEFAULT_PORT);
  if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) {
    throw new Error("YUKICODER_REVIEW_PORT must be a valid TCP port");
  }
  const server = createReviewServer({ repositoryRoot, assetRoot });
  server.listen(port, DEFAULT_HOST, () => {
    const address = server.address();
    const selectedPort =
      typeof address === "object" && address ? address.port : port;
    console.log(
      `Translation review workbench: http://${DEFAULT_HOST}:${selectedPort}/`,
    );
  });
}
