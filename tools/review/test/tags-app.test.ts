import assert from "node:assert/strict";
import test from "node:test";
import { reactPage } from "./react-fixture.ts";

test("tag screen searches, guards edits and saves without approval before explicit approval", async (t) => {
  let data = {
    locale: "ko",
    revision: "r1",
    tags: [
      {
        source: "動的計画法",
        target: "동적 계획법",
        reviewStatus: "unreviewed",
        problemCount: 313,
        solvedAcKey: "dp",
      },
      {
        source: "数学",
        target: "수학",
        reviewStatus: "unreviewed",
        problemCount: 213,
      },
    ],
  };
  const writes: any[] = [];
  const p = reactPage(
    t,
    async (path, init) => {
      if (path === "/api/tags") return Response.json(data);
      if (path.startsWith("/api/tags/") && init?.method === "PUT") {
        const body = JSON.parse(String(init.body));
        writes.push(body);
        data = {
          ...data,
          revision: "r" + (writes.length + 1),
          tags: data.tags.map((tag, i) =>
            i
              ? tag
              : {
                  ...tag,
                  target: body.target,
                  reviewStatus:
                    body.action === "approve" ? "approved" : "unreviewed",
                },
          ),
        };
        return Response.json(data);
      }
      throw Error(path);
    },
    "/tags",
    "tags",
  );
  await p.screen.findByRole("heading", { name: "태그 번역" });
  assert.equal(
    p.screen
      .getByText("solved.ac 기준 태그: dp", { selector: "a" })
      .getAttribute("href"),
    "https://solved.ac/problems/tags/dp",
  );
  const target = p.screen.getByRole("textbox", { name: "한국어 번역" });
  p.fireEvent.change(target, { target: { value: "다이나믹 프로그래밍" } });
  await p.user.click(p.screen.getByRole("button", { name: "数学" }));
  await p.screen.findByText("저장하지 않은 변경");
  await p.user.click(p.screen.getByRole("button", { name: "계속 편집" }));
  assert.equal(target.value, "다이나믹 프로그래밍");
  await p.user.click(
    p.screen.getByRole("button", { name: "저장", exact: true }),
  );
  await p.screen.findByText("저장했습니다.");
  assert.equal(writes[0].action, "save");
  await p.user.click(
    p.screen.getByRole("button", { name: "승인하고 다음", exact: true }),
  );
  await p.screen.findByText("승인했습니다.");
  assert.equal(writes[1].action, "approve");
  assert.equal(writes[1].revision, "r2");
  p.fireEvent.change(p.screen.getByRole("textbox", { name: "태그 검색" }), {
    target: { value: "수학" },
  });
  await p.screen.findByText("검색 결과 1개");
  await p.user.click(p.screen.getByRole("button", { name: "数学" }));
  await p.screen.findByRole("heading", { name: "数学" });
  assert.equal(
    p.screen.getByRole("textbox", { name: "한국어 번역" }).value,
    "수학",
  );
});

test("tag save conflict keeps draft and shows the error", async (t) => {
  const data = {
    locale: "ko",
    revision: "old",
    tags: [
      {
        source: "数学",
        target: "수학",
        reviewStatus: "unreviewed",
        problemCount: 2,
      },
    ],
  };
  const p = reactPage(
    t,
    async (path) =>
      path === "/api/tags"
        ? Response.json(data)
        : Response.json(
            { error: "태그 번역이 변경되었습니다." },
            { status: 409 },
          ),
    "/tags",
    "tags",
  );
  const input = await p.screen.findByRole("textbox", { name: "한국어 번역" });
  p.fireEvent.change(input, { target: { value: "수학 수정" } });
  await p.user.click(
    p.screen.getByRole("button", { name: "저장", exact: true }),
  );
  await p.screen.findByText("태그 번역이 변경되었습니다.");
  assert.equal(input.value, "수학 수정");
});

test("approval advances using the pre-save filtered order, wraps and completes without discarding edited wording", async (t) => {
  let data = {
    locale: "ko",
    revision: "r1",
    tags: [
      {
        source: "A",
        target: "검토 첫째",
        reviewStatus: "unreviewed",
        problemCount: 31,
      },
      {
        source: "B",
        target: "검토 둘째",
        reviewStatus: "unreviewed",
        problemCount: 32,
      },
      {
        source: "C",
        target: "검토 셋째",
        reviewStatus: "unreviewed",
        problemCount: 33,
      },
      {
        source: "D",
        target: "다른 검색 결과",
        reviewStatus: "unreviewed",
        problemCount: 34,
      },
    ],
  };
  const p = reactPage(
    t,
    async (path, init) => {
      if (path === "/api/tags") return Response.json(data);
      const source = decodeURIComponent(path.split("/").at(-1)!);
      const body = JSON.parse(String(init?.body));
      data = {
        ...data,
        revision: data.revision + "x",
        tags: data.tags.map((tag) =>
          tag.source === source
            ? { ...tag, target: body.target, reviewStatus: "approved" }
            : tag,
        ),
      };
      return Response.json(data);
    },
    "/tags?tag=B",
    "tags",
  );
  await p.screen.findByRole("heading", { name: "B", exact: true });
  p.fireEvent.change(p.screen.getByRole("textbox", { name: "태그 검색" }), {
    target: { value: "검토" },
  });
  await p.user.click(p.screen.getByRole("combobox", { name: "검토 상태" }));
  await p.user.click(
    p.screen.getByRole("option", { name: "미검토", exact: true }),
  );
  p.fireEvent.change(p.screen.getByRole("textbox", { name: "한국어 번역" }), {
    target: { value: "수정해서 검색에서도 빠지는 이름" },
  });
  await p.user.click(p.screen.getByRole("button", { name: "승인하고 다음" }));
  await p.screen.findByRole("heading", { name: "C", exact: true });
  assert.equal(p.screen.queryByText("저장하지 않은 변경"), null);
  assert.equal(data.tags[1].target, "수정해서 검색에서도 빠지는 이름");
  await p.user.click(p.screen.getByRole("button", { name: "승인하고 다음" }));
  await p.screen.findByRole("heading", { name: "A", exact: true });
  await p.user.click(p.screen.getByRole("button", { name: "승인하고 다음" }));
  await p.screen.findByText("현재 목록에 다음 미검토 태그가 없습니다.");
  await p.screen.findByText("검색 결과 0개");
  assert.equal(data.tags[3].reviewStatus, "unreviewed");
  assert(p.screen.getByRole("heading", { name: "A", exact: true }));
});

test("all tag row cells select the editor and still guard unsaved changes", async (t) => {
  const data = {
    locale: "ko",
    revision: "r1",
    tags: [
      {
        source: "A",
        target: "첫째",
        reviewStatus: "unreviewed",
        problemCount: 11,
      },
      {
        source: "B",
        target: "둘째",
        reviewStatus: "approved",
        problemCount: 22,
      },
    ],
  };
  const p = reactPage(t, async () => Response.json(data), "/tags", "tags");
  await p.screen.findByRole("heading", { name: "A", exact: true });
  await p.user.click(p.screen.getByText("둘째", { selector: "td" }));
  await p.screen.findByRole("heading", { name: "B", exact: true });
  await p.user.click(p.screen.getByText("11", { selector: "td" }));
  await p.screen.findByRole("heading", { name: "A", exact: true });
  await p.user.click(p.screen.getByText("승인됨", { selector: "td" }));
  await p.screen.findByRole("heading", { name: "B", exact: true });
  p.fireEvent.change(p.screen.getByRole("textbox", { name: "한국어 번역" }), {
    target: { value: "편집 중" },
  });
  await p.user.click(p.screen.getByText("첫째", { selector: "td" }));
  await p.screen.findByText("저장하지 않은 변경");
  await p.user.click(p.screen.getByRole("button", { name: "계속 편집" }));
  assert.equal(
    p.screen.getByRole("textbox", { name: "한국어 번역" }).value,
    "편집 중",
  );
});

test("approval skips approved tags and brings the next page into view", async (t) => {
  let data = {
    locale: "ko",
    revision: "r1",
    tags: Array.from({ length: 27 }, (_, i) => ({
      source: `tag${i}`,
      target: `번역 ${i}`,
      reviewStatus: i === 25 ? "approved" : "unreviewed",
      problemCount: 100 - i,
    })),
  };
  const p = reactPage(
    t,
    async (path, init) => {
      if (path === "/api/tags") return Response.json(data);
      const body = JSON.parse(String(init?.body));
      data = {
        ...data,
        revision: "r2",
        tags: data.tags.map((tag) =>
          tag.source === "tag24"
            ? { ...tag, target: body.target, reviewStatus: "approved" }
            : tag,
        ),
      };
      return Response.json(data);
    },
    "/tags?tag=tag24",
    "tags",
  );
  await p.screen.findByRole("heading", { name: "tag24", exact: true });
  await p.user.click(p.screen.getByRole("button", { name: "승인하고 다음" }));
  await p.screen.findByRole("heading", { name: "tag26", exact: true });
  assert(p.screen.getByRole("button", { name: "tag26", exact: true }));
  assert.equal(
    p.screen.queryByRole("button", { name: "tag0", exact: true }),
    null,
  );
});

test("keep original deletes the entry and advances, including the final entry with an unsaved draft", async (t) => {
  let data = {
    locale: "ko",
    revision: "r1",
    tags: [
      {
        source: "A",
        target: "첫째",
        reviewStatus: "approved",
        problemCount: 11,
      },
      {
        source: "B",
        target: "둘째",
        reviewStatus: "unreviewed",
        problemCount: 22,
      },
    ],
  };
  const p = reactPage(
    t,
    async (path, init) => {
      if (path === "/api/tags") return Response.json(data);
      assert.equal(init?.method, "DELETE");
      assert.equal(JSON.parse(String(init?.body)).revision, data.revision);
      const source = decodeURIComponent(path.split("/").at(-1)!);
      data = {
        ...data,
        revision: data.revision + "x",
        tags: data.tags.filter((tag) => tag.source !== source),
      };
      return Response.json(data);
    },
    "/tags",
    "tags",
  );
  await p.screen.findByRole("heading", { name: "A", exact: true });
  await p.user.click(
    p.screen.getByRole("button", { name: "원문 그대로 두기" }),
  );
  await p.screen.findByRole("heading", { name: "B", exact: true });
  assert.equal(
    p.screen.queryByRole("button", { name: "A", exact: true }),
    null,
  );
  p.fireEvent.change(p.screen.getByRole("textbox", { name: "한국어 번역" }), {
    target: { value: "" },
  });
  await p.user.click(
    p.screen.getByRole("button", { name: "원문 그대로 두기" }),
  );
  await p.screen.findByText("등록된 태그가 없습니다.");
  assert.equal(p.screen.queryByText("저장하지 않은 변경"), null);
  assert.equal(data.tags.length, 0);
});

test("failed removal keeps the selected entry and unsaved text", async (t) => {
  const data = {
    locale: "ko",
    revision: "r1",
    tags: [
      {
        source: "A",
        target: "첫째",
        reviewStatus: "unreviewed",
        problemCount: 11,
      },
    ],
  };
  const p = reactPage(
    t,
    async (path) =>
      path === "/api/tags"
        ? Response.json(data)
        : Response.json(
            { error: "다른 창에서 변경되었습니다." },
            { status: 409 },
          ),
    "/tags",
    "tags",
  );
  const input = await p.screen.findByRole("textbox", { name: "한국어 번역" });
  p.fireEvent.change(input, { target: { value: "변경 중" } });
  await p.user.click(
    p.screen.getByRole("button", { name: "원문 그대로 두기" }),
  );
  await p.screen.findByText("다른 창에서 변경되었습니다.");
  assert.equal(input.value, "변경 중");
  assert(p.screen.getByRole("heading", { name: "A", exact: true }));
});
