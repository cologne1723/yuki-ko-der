import { hc, type InferRequestType } from "hono/client";
import type { createReviewApp } from "../../src/review-server.ts";

const client = hc<ReturnType<typeof createReviewApp>>("/");
const api = client.api;
async function responseData<T>(
  request: Promise<{ ok: boolean; status: number; json(): Promise<T> }>,
): Promise<T> {
  const response = await request;
  const data = await response.json().catch(() => undefined);
  if (!response.ok)
    throw new Error(
      data && typeof data === "object" && "error" in data
        ? String(data.error)
        : `HTTP ${response.status}`,
    );
  if (data === undefined)
    throw new Error("서버 응답을 읽을 수 없습니다. 다시 시도하세요.");
  return data;
}
const requestOptions = (signal?: AbortSignal) => ({ init: { signal } });
export const reviewApi = {
  tags: (signal?: AbortSignal) =>
    responseData(api.tags.$get({}, requestOptions(signal))),
  deleteTag: (source: string, revision: string) =>
    responseData(
      api.tags[":source"].$delete({ param: { source }, json: { revision } }),
    ),
  saveTag: (
    source: string,
    json: InferRequestType<(typeof api.tags)[":source"]["$put"]>["json"],
  ) => responseData(api.tags[":source"].$put({ param: { source }, json })),
  problems: (signal?: AbortSignal) =>
    responseData(api.problems.$get({}, requestOptions(signal))),
  problem: (number: string, signal?: AbortSignal) =>
    responseData(
      api.problems[":number"].$get(
        { param: { number } },
        requestOptions(signal),
      ),
    ),
  saveProblem: (
    number: string,
    json: InferRequestType<(typeof api.problems)[":number"]["$put"]>["json"],
    action: "save" | "approve" | "unapprove",
  ) => {
    const route = api.problems[":number"];
    const input = { param: { number }, json };
    return responseData(
      action === "save" ? route.$put(input) : route[action].$post(input),
    );
  },
  glossary: (signal?: AbortSignal) =>
    responseData(api.ui.$get({}, requestOptions(signal))),
  collectProblemProfile: (number: string) =>
    responseData(
      api.problems[":number"]["render-profile"].$post({ param: { number } }),
    ),
  page: (name: string, signal?: AbortSignal) =>
    responseData(
      api["ui-pages"][":name"].$get(
        { param: { name } },
        requestOptions(signal),
      ),
    ),
  saveMessage: (
    file: string,
    index: number,
    json: InferRequestType<(typeof api.ui)[":file"][":index"]["$put"]>["json"],
  ) =>
    responseData(
      api.ui[":file"][":index"].$put({
        param: { file, index: String(index) },
        json,
      }),
    ),
  saveShared: (
    file: string,
    index: number,
    json: InferRequestType<
      (typeof api)["ui-shared"][":file"][":index"]["$put"]
    >["json"],
  ) =>
    responseData(
      api["ui-shared"][":file"][":index"].$put({
        param: { file, index: String(index) },
        json,
      }),
    ),
  imports: (signal?: AbortSignal) =>
    responseData(api.ui.imports.$get({}, requestOptions(signal))),
  selectImport: (
    json: InferRequestType<(typeof api.ui.imports.selection)["$put"]>["json"],
  ) => responseData(api.ui.imports.selection.$put({ json })),
  saveImport: (
    id: string,
    json: InferRequestType<(typeof api.ui.imports)[":id"]["$put"]>["json"],
  ) => responseData(api.ui.imports[":id"].$put({ param: { id }, json })),
  snapshot: (
    id: string,
    collection: string,
    occurrence: string,
    signal?: AbortSignal,
  ) =>
    responseData(
      api.ui.imports[":id"].snapshot[":collection"][":occurrence"].$get(
        { param: { id, collection, occurrence } },
        requestOptions(signal),
      ),
    ),
  deleteCollection: (id: string) =>
    responseData(api.collections[":id"].$delete({ param: { id } })),
  tasks: (signal?: AbortSignal) =>
    responseData(api.tasks.$get({}, requestOptions(signal))),
  task: (id: string, signal?: AbortSignal) =>
    responseData(
      api.tasks[":id"].$get({ param: { id } }, requestOptions(signal)),
    ),
  startTask: (json: InferRequestType<(typeof api.tasks)["$post"]>["json"]) =>
    responseData(api.tasks.$post({ json })),
  cancelTask: (id: string) =>
    responseData(api.tasks[":id"].cancel.$post({ param: { id } })),
  convertTask: (id: string) =>
    responseData(api.tasks[":id"].convert.$post({ param: { id } })),
  recovery: (signal?: AbortSignal) =>
    responseData(api.tasks.recovery.$get({}, requestOptions(signal))),
  options: (signal?: AbortSignal) =>
    responseData(api.tools.options.$get({}, requestOptions(signal))),
  settings: (signal?: AbortSignal) =>
    responseData(api.settings.$get({}, requestOptions(signal))),
  saveSettings: (
    json: InferRequestType<(typeof api.settings)["$put"]>["json"],
  ) => responseData(api.settings.$put({ json })),
};
