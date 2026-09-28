import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { SourceFormulaCorrection } from "./problem-preservation.ts";

// Human-translated No.30 diagrams: all product numbers, edge directions and
// quantities were compared with the originals. Only these exact assets qualify.
export async function sourceImageTranslations(
  problemNo: number,
  originalHtml: string,
  repositoryRoot: string,
) {
  if (
    problemNo !== 30 ||
    createHash("sha256").update(originalHtml).digest("hex") !==
      "75fa9a579e9c9347f0199fac039305712fce7666cc3ebaf42e3250689469824b"
  )
    return [];
  const hashes = [
    [
      "edeedb16c55632d8b0d4a13b37d976e5fbf0ccf6908fa059588e70c7d74862bb",
      "aa73e68c4b3033870289d223f8907dce52e400c46dab91410efbe7958b94add6",
    ],
    [
      "3ab81b6c18b1ce99abba42f2764db5b1b03d9f39b971180e01babf86e66f4651",
      "3b21cbd22d166a324f017a55484e6b3d1c26dfa349ec216ce883789e78c45862",
    ],
    [
      "6c1153a4294a57532588f2ce7665d8c36a9b6dd04331e1d5da01ccbf459a3410",
      "0529b1e7becf6086b0c1cbeb4a976e81dc84f3e8d5531a68839473df952343c1",
    ],
  ];
  return Promise.all(
    hashes.map(async (pair, index) => {
      const bytes = await Promise.all(
        ["", "-ko"].map((suffix) =>
          readFile(
            join(
              repositoryRoot,
              "problem-translations/ko/images/30",
              `${index + 1}${suffix}.png`,
            ),
          ),
        ),
      );
      for (let i = 0; i < 2; i++)
        if (createHash("sha256").update(bytes[i]).digest("hex") !== pair[i])
          throw new Error(
            `No.30 translated image ${index + 1}: recorded image hash mismatch`,
          );
      return {
        before: "data:image/png;base64," + bytes[0].toString("base64"),
        after: "data:image/png;base64," + bytes[1].toString("base64"),
      };
    }),
  );
}

// No.3272's second IMG contains the literal typo "imrage/png".
// Restrict correction to the saved source hash and verify the PNG signature;
// neither arbitrary MIME mismatches nor changed source snapshots are accepted.
export function correctSourceImageMime(
  problemNo: number,
  originalHtml: string,
  document: Document,
): void {
  if (
    problemNo !== 3272 ||
    createHash("sha256").update(originalHtml).digest("hex") !==
      "331fda851b0571dde5243241b6d8511b92415f5687d691694343f787e5bf3b81"
  )
    return;
  const prefix = "data:imrage/png;base64,";
  const images = [...document.querySelectorAll("img[src]")].filter((image) =>
    image.getAttribute("src")!.startsWith(prefix),
  );
  if (images.length !== 1)
    throw new Error("No.3272 MIME correction count mismatch");
  const src = images[0].getAttribute("src")!;
  const bytes = Buffer.from(src.slice(prefix.length), "base64");
  if (!bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")))
    throw new Error("No.3272 corrected image is not PNG");
  images[0].setAttribute(
    "src",
    "data:image/png;base64," + src.slice(prefix.length),
  );
}

// Only unambiguous corrections with recorded evidence belong here. A changed
// source snapshot falls back to ordinary strict checking, never a broad waiver.
const records: readonly {
  problemNo: number;
  sourceHtmlSha256: string;
  reason: string;
  formulas?: readonly SourceFormulaCorrection[];
  binaryLiteralFormulas?: readonly string[];
}[] = [
  {
    problemNo: 21,
    sourceHtmlSha256:
      "d177a980de4d3fe58ec48145e5da0e367ed6976ba220692e43ec4a32740700de",
    reason:
      "Example 1 input contains 432, not 433; the following mean (432+301)/2=366.5 independently confirms the human-approved correction.",
    formulas: [
      {
        before: String.raw`\{\{555\}, \{21,20\}, \{433,301\}\}`,
        after: String.raw`\{\{555\},\{21,20\},\{432,301\}\}`,
        occurrences: 1,
      },
    ],
  },
  {
    problemNo: 2911,
    sourceHtmlSha256:
      "3d68448bbc9036cc5cfd2c1a4a1d7a2107d3f14a42100e4eb51dd6b8b002db2f",
    reason:
      "Example 4: {2,3} intersect {1,2} is {2}, consistent with 011 AND 110 = 010. See BLOCKER.md, No.2911.",
    formulas: [
      {
        before: String.raw`\{2,3\} \cap \{1,2\} = \{1\} \notin \mathcal{O}_S`,
        after: String.raw`\{2,3\} \cap \{1,2\} = \{2\} \notin \mathcal{O}_S`,
        occurrences: 1,
      },
    ],
  },
  {
    problemNo: 3009,
    sourceHtmlSha256:
      "0bf6c6c580f1a326a441e72571eb75f5c638b998798261d24272739f0fcb525c",
    reason:
      "Examples explicitly enumerate binary strings of widths 4 and 16, not decimal integers. See BLOCKER.md, No.3009.",
    binaryLiteralFormulas: [
      String.raw`\mathcal{T} = \{ 0000, 1000, 1001, 1010, 1011, 1100, 1101, 1110, 1111 \}`,
      "1111",
      "1111111111111111",
    ],
  },
  {
    problemNo: 3553,
    sourceHtmlSha256:
      "187f7b3475506b0a7245cea673b292ddd2ed804dce6d85a28ba6da111b2d7796",
    reason:
      "All queries are defined with t_q in {1,2}; the isolated t_1 constraint is a subscript typo. See BLOCKER.md, No.3553.",
    formulas: [
      {
        before: "t_1 \\in \\{1, 2\\}",
        after: "t_q \\in \\{1, 2\\}",
        occurrences: 1,
      },
    ],
  },
  {
    problemNo: 3582,
    sourceHtmlSha256:
      "cdbf70dae4015a4d64a567e62056c1594f036e48edc2b0411d91a294b142e22e",
    reason:
      "Examples 1/2 have B=0 and bare T input, so T is empty; example2 empty-index sum has no upper limit. See BLOCKER.md, No.3582.",
    formulas: [
      {
        before: "(1,0,1,\\{1\\},\\{0\\})",
        after: "(1,0,1,\\{1\\},\\{\\})",
        occurrences: 1,
      },
      {
        before: "(1,0,0,\\{1\\},\\{0\\})",
        after: "(1,0,0,\\{1\\},\\{\\})",
        occurrences: 1,
      },
      {
        before:
          "\\displaystyle\n\\{x \\in \\mathbb{Z}^1 \\mid x_1 \\leq 0\\} \\cup \\left\\{x \\in \\mathbb{Z}^1 \\middle| \\sum_{i \\in \\{\\}}^{1} x_i \\leq 1 + \\sum_{j \\in \\{1\\}} x_j \\right\\} = \\{x \\in \\mathbb{Z}^1 \\mid x_1 \\leq 0 \\lor 0 \\leq 1 + x_1\\} = \\mathbb{Z}^1\n",
        after:
          "\\displaystyle\n\\{x \\in \\mathbb{Z}^1 \\mid x_1 \\leq 0\\} \\cup \\left\\{x \\in \\mathbb{Z}^1 \\middle| \\sum_{i \\in \\{\\}} x_i \\leq 1 + \\sum_{j \\in \\{1\\}} x_j \\right\\} = \\{x \\in \\mathbb{Z}^1 \\mid x_1 \\leq 0 \\lor 0 \\leq 1 + x_1\\} = \\mathbb{Z}^1\n",
        occurrences: 1,
      },
    ],
  },
];

export function sourceFormulaCorrections(
  problemNo: number,
  originalHtml: string,
): readonly SourceFormulaCorrection[] {
  const hash = createHash("sha256").update(originalHtml).digest("hex");
  return (
    records.find(
      (record) =>
        record.problemNo === problemNo && record.sourceHtmlSha256 === hash,
    )?.formulas ?? []
  );
}

export function sourceBinaryLiteralFormulas(
  problemNo: number,
  originalHtml: string,
): readonly string[] {
  const hash = createHash("sha256").update(originalHtml).digest("hex");
  return (
    records.find(
      (record) =>
        record.problemNo === problemNo && record.sourceHtmlSha256 === hash,
    )?.binaryLiteralFormulas ?? []
  );
}
