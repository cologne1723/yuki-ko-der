import { readdir } from "node:fs/promises";
import { jsonBody, settingsSaveSchema } from "./request-schemas.ts";

import {
  preferredDataDirectory,
  saveDataDirectory,
} from "translation-core/review-settings";

import { join } from "node:path";

import { Hono } from "hono";

import { ReviewError } from "./problem-review.ts";

export function settingsRoutes(options: {
  repositoryRoot: string;
  dataRoot: string;
}) {
  return new Hono()
    .get("/api/settings", (c) =>
      c.json({
        activeDataDirectory: options.dataRoot,
        nextDataDirectory:
          preferredDataDirectory(options.repositoryRoot) ??
          join(options.repositoryRoot, "data"),
      }),
    )
    .put(
      "/api/settings",
      jsonBody(settingsSaveSchema, "Data directory requires a path"),
      async (c) => {
        const body = c.req.valid("json");
        try {
          const nextDataDirectory = await saveDataDirectory(
            options.repositoryRoot,
            body.dataDirectory,
          );
          return c.json({
            activeDataDirectory: options.dataRoot,
            nextDataDirectory,
            restartRequired: nextDataDirectory !== options.dataRoot,
          });
        } catch (error) {
          throw new ReviewError(String(error), 400);
        }
      },
    )
    .get("/api/tools/options", async (c) => {
      const names = async (path: string, suffix: string) => {
        try {
          return (await readdir(path))
            .filter((name) => name.endsWith(suffix))
            .sort();
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
          throw error;
        }
      };
      return c.json({
        pages: await names(join(options.dataRoot!, "pages"), ".html"),
        dictionaries: await names(
          join(options.repositoryRoot, "translations/ko"),
          ".json",
        ),
      });
    });
}
