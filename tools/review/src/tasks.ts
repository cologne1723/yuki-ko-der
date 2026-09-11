import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { Worker } from "node:worker_threads";
import {
  inputRevision,
  operationInput,
} from "translation-audit/operations/run";
import { pLimit } from "translation-core/concurrency";
import type { z } from "translation-core/validation";
import { ReviewError } from "./problem-review.ts";
import { TaskHistory } from "./task-history.ts";
import { taskSchema } from "./task-schema.ts";
export type ReviewTask = z.infer<typeof taskSchema> & { stale?: boolean };
export class ReviewTasks {
  private active?: {
    task: ReviewTask;
    worker: Worker;
    lock: DatabaseSync;
    finished: Promise<void>;
  };
  private queue = pLimit(1);
  private ready?: Promise<void>;
  private history: TaskHistory;
  readonly directory: string;
  constructor(
    readonly repositoryRoot: string,
    readonly dataRoot: string,
  ) {
    this.directory = join(dataRoot, "reports/review-tasks");
    this.history = new TaskHistory(this.directory);
  }
  // Construction must not start unobserved filesystem work. Routes that never
  // use tasks (and fixtures that remove their directory) need no task history.
  initialize(): Promise<void> {
    return (this.ready ??= this.refresh().catch((error) => {
      this.ready = undefined;
      throw error;
    }));
  }
  async whenIdle(): Promise<void> {
    // An explicit initialize() may be in flight outside the operation queue.
    // Its caller receives the error; teardown still waits for it to settle.
    await this.ready?.catch(() => undefined);
    // Read the active worker after queued work, then wait outside the queue so
    // its exit handler can persist the final record and release ownership.
    const active = await this.queue(async () => this.active);
    await active?.finished;
    await this.queue(async () => undefined);
  }
  private refresh(lock?: DatabaseSync, id?: string) {
    return this.history.refresh(lock, id, this.active?.task.id);
  }
  async recovery() {
    return this.serial(async () => {
      await this.refresh();
      return structuredClone(this.history.recoveryWarnings);
    });
  }
  private serial<T>(work: () => Promise<T>) {
    return this.queue(async () => {
      await this.initialize();
      return work();
    });
  }
  async list() {
    return this.serial(async () => {
      await this.refresh();
      return [...this.history.tasks.values()]
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
        .map((task) => ({
          id: task.id,
          status: task.status,
          input: {
            operation: task.input.operation,
            problems: task.input.problems,
            problemNo: task.input.problemNo,
            selection: task.input.selection,
          },
          startedAt: task.startedAt,
        }));
    });
  }
  async get(id: string) {
    return this.serial(async () => {
      await this.refresh(undefined, id);
      const task = this.history.tasks.get(id);
      if (!task) throw new ReviewError("Task not found", 404);
      const copy = structuredClone(task);
      if (task.status !== "running" && task.status !== "cancelling")
        copy.stale =
          (await inputRevision(
            { repositoryRoot: this.repositoryRoot, dataRoot: task.dataRoot },
            task.input,
          )) !== task.revision;
      return copy;
    });
  }
  start(value: unknown) {
    return this.serial(async () => {
      if (this.active) throw new ReviewError("Another task is running", 409);
      const lock = await this.history.acquireLock();
      if (!lock)
        throw new ReviewError(
          "Another review server owns the running task",
          409,
        );
      try {
        await this.refresh(lock);
        const input = operationInput(value),
          context = {
            repositoryRoot: this.repositoryRoot,
            dataRoot: this.dataRoot,
          };
        const task: ReviewTask = {
          id: randomUUID(),
          input,
          dataRoot: this.dataRoot,
          revision: await inputRevision(context, input),
          startedAt: new Date().toISOString(),
          status: "running",
          progress: [],
        };
        await this.history.persist(task);
        this.history.tasks.set(task.id, task);
        let worker: Worker;
        try {
          worker = new Worker(new URL("./task-worker.ts", import.meta.url), {
            workerData: { context, input },
            execArgv: ["--import", "tsx"],
          });
        } catch (error) {
          task.status = "failed";
          task.error = String(error);
          await this.history.persist(task);
          return structuredClone(task);
        }
        const { promise: finished, resolve: finish } =
          Promise.withResolvers<void>();
        this.active = { task, worker, lock, finished };
        worker.on(
          "message",
          (message) =>
            void this.serial(async () => {
              if (task.status === "failed") return;
              if (message.type === "progress") {
                task.progress.push(message.item);
              } else if (message.type === "result") {
                task.result = message.result;
                task.status =
                  task.status === "cancelling" ? "cancelled" : "completed";
              } else {
                task.status =
                  message.type === "cancelled" ? "cancelled" : "failed";
                task.error = message.error;
              }
              await this.history.persist(task);
            }).catch((error) => {
              task.status = "failed";
              task.error = `Could not save task progress: ${String(error)}`;
              worker.postMessage({ type: "cancel" });
            }),
        );
        worker.on(
          "error",
          (error) =>
            void this.serial(async () => {
              task.status = "failed";
              task.error = String(error);
              await this.history.persist(task);
            }).catch(() => undefined),
        );
        worker.on(
          "exit",
          () =>
            void this.serial(async () => {
              try {
                if (task.status === "running" || task.status === "cancelling") {
                  task.status =
                    task.status === "cancelling" ? "cancelled" : "failed";
                  task.error ??= "Worker stopped before a result was received";
                  await this.history.persist(task);
                }
                await this.history.persist(task);
              } finally {
                if (this.active?.task.id === task.id) this.active = undefined;
                lock.close();
                finish();
              }
            }).catch((error) => {
              task.status = "failed";
              task.error = `Could not save task completion: ${String(error)}`;
            }),
        );
        return structuredClone(task);
      } finally {
        if (this.active?.lock !== lock) lock.close();
      }
    });
  }
  cancel(id: string) {
    return this.serial(async () => {
      await this.refresh(undefined, id);
      const task = this.history.tasks.get(id);
      if (!task) throw new ReviewError("Task not found", 404);
      if (
        this.active?.task.id !== id &&
        ["running", "cancelling"].includes(task.status)
      )
        throw new ReviewError(
          "Cancel this task in the review server that started it",
          409,
        );
      if (
        this.active?.task.id === id &&
        ["running", "cancelling"].includes(task.status)
      ) {
        task.status = "cancelling";
        this.active.worker.postMessage({ type: "cancel" });
        await this.history.persist(task);
      }
      return structuredClone(task);
    });
  }
}
