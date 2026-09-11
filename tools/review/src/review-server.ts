import { getRequestListener } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { createServer } from "node:http";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  buildDirectory,
  dataDirectory,
  defaultDataDirectory,
  repositoryRoot,
} from "translation-core/paths";
import { MAX_ARCHIVE_BYTES } from "./collection-archive.ts";
import { CollectionReviewStore } from "./collection-review.ts";
import { collectionsRoutes } from "./collections-routes.ts";
import { importsRoutes } from "./imports-routes.ts";
import { ProblemReviewStore, ReviewError } from "./problem-review.ts";
import { problemsRoutes } from "./problems-routes.ts";
import { reviewHeaders } from "./security.ts";
import { settingsRoutes } from "./settings-routes.ts";
import { tasksRoutes } from "./tasks-routes.ts";
import { ReviewTasks } from "./tasks.ts";
import { UiImportStore } from "./ui-imports.ts";
import { UiReviewStore } from "./ui-review.ts";
import { uiRoutes } from "./ui-routes.ts";
import { tagsRoutes } from "./tags-routes.ts";

export function createReviewApp(options: {
  repositoryRoot: string;
  assetRoot: string;
  dataRoot?: string;
  taskStore?: ReviewTasks;
}) {
  options = {
    ...options,
    dataRoot: options.dataRoot ?? defaultDataDirectory(options.repositoryRoot),
  };
  let taskStore = options.taskStore;
  const tasks = () =>
    (taskStore ??= new ReviewTasks(options.repositoryRoot, options.dataRoot!));
  const store = new ProblemReviewStore(
    options.repositoryRoot,
    options.dataRoot,
  );
  const uiStore = new UiReviewStore(options.repositoryRoot, options.dataRoot);
  const collections = new CollectionReviewStore(
    options.repositoryRoot,
    options.dataRoot,
  );
  const imports = new UiImportStore(
    uiStore,
    collections,
    options.repositoryRoot,
    options.dataRoot,
  );
  const app = new Hono();
  app.use("*", reviewHeaders);
  app.use("*", async (c, next) => {
    c.header("cache-control", "no-store");
    c.header(
      "content-security-policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://yukicoder.me https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://use.fontawesome.com; frame-src 'self'; connect-src 'self'; img-src 'self' data: https://yukicoder.me; font-src 'self' data: https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://use.fontawesome.com",
    );
    const host = c.req.header("host");
    const parsed = host ? new URL(`http://${host}`) : undefined;
    if (
      !parsed ||
      !["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)
    )
      throw new ReviewError(
        "Review server accepts loopback requests only",
        403,
      );
    if (["PUT", "POST", "DELETE"].includes(c.req.method)) {
      const origin = c.req.header("origin");
      if (origin && origin !== parsed.origin)
        throw new ReviewError("Cross-origin writes are not allowed", 403);
    }
    await next();
  });
  app.use("/api/*", (c, next) =>
    bodyLimit({
      maxSize:
        c.req.method === "POST" && c.req.path === "/api/collections"
          ? MAX_ARCHIVE_BYTES
          : 8 * 1024 * 1024,
      onError: (ctx) => ctx.json({ error: "Request body is too large" }, 413),
    })(c, next),
  );
  app.onError((error, c) =>
    c.json(
      { error: error.message },
      (error instanceof ReviewError
        ? error.statusCode
        : error instanceof SyntaxError
          ? 400
          : 500) as 400,
    ),
  );
  const routed = app
    .route(
      "/",
      settingsRoutes({
        repositoryRoot: options.repositoryRoot,
        dataRoot: options.dataRoot!,
      }),
    )
    .route("/", tasksRoutes(tasks, store))
    .route("/", collectionsRoutes(collections, uiStore))
    .route("/", importsRoutes(imports))
    .route("/", uiRoutes(uiStore))
    .route("/", tagsRoutes(options.repositoryRoot))
    .route("/", problemsRoutes(store));
  app.get("/collections", (c) => c.redirect("/ui?view=imports", 302));
  const staticFiles: Record<string, string> = {
    "/": "index.html",
    "/ui": "index.html",
    "/tags": "index.html",
    "/tools": "index.html",
    "/app.js": "app.js",
    "/app.css": "app.css",
    "/app.js.map": "app.js.map",
    "/app.css.map": "app.css.map",
  };
  for (const [route, file] of Object.entries(staticFiles))
    app.get(route, serveStatic({ path: join(options.assetRoot, file) }));
  app.get("/katex/*", async (c, next) => {
    if (
      !/^\/katex\/(katex\.min\.css|fonts\/[A-Za-z0-9._-]+\.(woff2?|ttf))$/u.test(
        c.req.path,
      )
    )
      return c.notFound();
    // Sandboxed previews have an opaque origin; public math fonts need CORS.
    c.header("Access-Control-Allow-Origin", "*");
    return serveStatic({ path: join(options.assetRoot, c.req.path) })(c, next);
  });
  app.get("/mathjax/fonts/woff-v2/:font", async (c, next) => {
    if (!/^[A-Za-z0-9._-]+\.woff$/u.test(c.req.param("font")))
      return c.notFound();
    c.header("Access-Control-Allow-Origin", "*");
    return serveStatic({
      path: join(
        options.assetRoot,
        "mathjax/fonts/woff-v2",
        c.req.param("font"),
      ),
    })(c, next);
  });
  app.notFound((c) => c.json({ error: "Not found" }, 404));
  return routed;
}
export function createReviewServer(
  options: Parameters<typeof createReviewApp>[0],
) {
  return createServer(getRequestListener(createReviewApp(options).fetch));
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const port = Number(process.env.YUKICODER_REVIEW_PORT ?? 4173);
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535)
    throw new Error("YUKICODER_REVIEW_PORT must be a valid TCP port");
  const server = createReviewServer({
    repositoryRoot,
    assetRoot: buildDirectory("review"),
    dataRoot: dataDirectory(),
  });
  server.listen(port, "127.0.0.1", () => {
    const address = server.address();
    console.log(
      `Translation review workbench: http://127.0.0.1:${typeof address === "object" && address ? address.port : port}/`,
    );
    console.log("Tools and settings: /tools. UI dictionary editing: /ui");
  });
}
