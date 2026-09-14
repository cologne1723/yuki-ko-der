import { register } from "tsx/esm/api";

// Register inside the worker before importing TypeScript. A preload alone can
// leave worker imports using Node's strip-only TypeScript loader.
register();
await import("./task-worker.ts");
