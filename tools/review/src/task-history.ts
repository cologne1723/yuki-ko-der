import { mkdir, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { operationInput } from "translation-audit/operations/run";
import { atomicFile } from "translation-audit/operations/source-store";
import { ReviewError } from "./problem-review.ts";
import { taskSchema } from "./task-schema.ts";
import type { ReviewTask } from "./tasks.ts";
export class TaskHistory {
  constructor(readonly directory: string) {}

  tasks = new Map<string, ReviewTask>();

  recoveryWarnings: { file: string; error: string }[] = [];

  async acquireLock() {
    await mkdir(this.directory, { recursive: true });
    const { DatabaseSync } = await import("node:sqlite");
    const lock = new DatabaseSync(join(this.directory, ".owner.sqlite"));
    try {
      lock.exec("BEGIN IMMEDIATE");
      return lock;
    } catch (error) {
      lock.close();
      if ([5, 6].includes((error as { errcode?: number }).errcode ?? -1))
        return undefined;
      throw error;
    }
  }

  async refresh(ownedLock?: DatabaseSync, onlyId?: string, activeId?: string) {
    if (onlyId && !/^[a-f0-9-]+$/.test(onlyId))
      throw new ReviewError("Task not found", 404);
    if (activeId && !ownedLock) return;
    await mkdir(this.directory, { recursive: true });
    const lock = ownedLock ?? (activeId ? undefined : await this.acquireLock());
    const warnings: { file: string; error: string }[] = onlyId
      ? this.recoveryWarnings.filter(
          (warning) => warning.file !== `${onlyId}.json`,
        )
      : [];
    try {
      for (const name of onlyId
        ? [`${onlyId}.json`]
        : await readdir(this.directory)) {
        if (!/^[a-f0-9-]+\.json$/.test(name)) continue;
        if (name === `${activeId}.json`) continue;
        const cached = this.tasks.get(name.slice(0, -5));
        // Terminal records are immutable; list polling need not reread their potentially large artifacts.
        // Opening a task still reloads its record explicitly.
        if (
          !onlyId &&
          cached &&
          !["running", "cancelling"].includes(cached.status)
        )
          continue;
        let task: ReviewTask;
        try {
          const value: unknown = JSON.parse(
            await readFile(join(this.directory, name), "utf8"),
          );
          const parsed = taskSchema.safeParse(value);
          if (!parsed.success)
            throw new Error(
              "Invalid saved task: " + JSON.stringify(parsed.error.issues),
            );
          // Keep persisted input key order: it participates in revision hashes.
          task = value as ReviewTask;
          if (task.id !== name.slice(0, -5))
            throw new Error("Invalid persisted task identity");
          operationInput(task.input);
        } catch (error) {
          // Retain the original record for inspection; one broken history entry must not disable all work.
          this.tasks.delete(name.slice(0, -5));
          if ((error as NodeJS.ErrnoException).code !== "ENOENT")
            warnings.push({ file: name, error: String(error) });
          continue;
        }
        if (
          lock &&
          (task.status === "running" || task.status === "cancelling")
        ) {
          task.status = "interrupted";
          task.error = "Review server stopped before task completion";
          await this.persist(task);
        }
        this.tasks.set(task.id, task);
      }
      this.recoveryWarnings = warnings;
    } finally {
      if (lock && lock !== ownedLock) lock.close();
    }
  }

  persist(task: ReviewTask) {
    return atomicFile(
      join(this.directory, `${task.id}.json`),
      JSON.stringify(task) + "\n",
    );
  }
}
