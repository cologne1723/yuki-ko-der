import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { atomicFile } from "translation-core/atomic-file";
import { z } from "translation-core/validation";
const progressSchema = z.looseObject({
  selected: z.string().optional(),
  collection: z.string().optional(),
  tasks: z.record(z.string(), z.enum(["deferred", "excluded"])),
  bases: z.record(z.string(), z.string()).optional(),
});

export type Progress = z.infer<typeof progressSchema>;
export class ImportProgress {
  constructor(private directory: string) {}
  async read(): Promise<Progress> {
    try {
      const value = JSON.parse(
        await readFile(join(this.directory, "ui-progress.json"), "utf8"),
      );
      if (!progressSchema.safeParse(value).success)
        throw new Error("Invalid imported review progress");
      return value;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        return { tasks: {} };
      throw error;
    }
  }
  async write(value: Progress) {
    await mkdir(this.directory, { recursive: true });
    const path = join(this.directory, "ui-progress.json");
    await atomicFile(path, JSON.stringify(value));
  }
}
