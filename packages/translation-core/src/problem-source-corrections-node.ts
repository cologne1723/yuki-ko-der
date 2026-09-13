import { createHash } from "node:crypto";
import type { SourceFormulaCorrection } from "./problem-preservation.ts";

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
