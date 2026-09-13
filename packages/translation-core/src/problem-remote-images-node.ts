import { createHash } from "node:crypto";
import {
  readLocalProblemImage,
  type ProblemImageResolverOptions,
} from "./problem-assets-node.ts";

// Downloaded from these exact source URLs (HTTPS transport for legacy HTTP).
// No network during validation. Pins record the fetched image, not a guarantee
// that a mutable external host will serve the same bytes forever.
// Evidence: data/reports/translation-external-images-2026-09-13.md.
export const remoteProblemImageSnapshots = [
  {
    problemNo: 5021,
    sourceHtmlSha256:
      "90d5e5aff869c110d54819d7989f291059618c115d69c44580236cb765d05c1e",
    sourceUrl: "https://i.ibb.co/mrSVL5Zb/1.jpg",
    reference: "../images/5021/1.jpg",
    sha256: "4e0e8571b9fe327a9b512576d0f205ee8b02d05a5798c5e3ec676565c4ac4fa7",
  },
  {
    problemNo: 8018,
    sourceHtmlSha256:
      "7096ca293d875cff69bdcd949c69ed9a21e2f20671878c4b41a566ab8416dd48",
    sourceUrl:
      "http://img.atwikiimg.com/www46.atwiki.jp/sinapusu2002/attach/355/20/test1.gif",
    reference: "../images/8018/1.gif",
    sha256: "0e4b929bd10ec7e77a69776975c38d9b1a4bc8eb746c50f7fab45b60e9add092",
  },
  {
    problemNo: 8018,
    sourceHtmlSha256:
      "7096ca293d875cff69bdcd949c69ed9a21e2f20671878c4b41a566ab8416dd48",
    sourceUrl:
      "http://img.atwikiimg.com/www46.atwiki.jp/sinapusu2002/attach/355/21/test2.gif",
    reference: "../images/8018/2.gif",
    sha256: "61cbd72793023eef24e1198e67cc3c4847612e290eea2a26e71ecb10b3fdd80f",
  },
  {
    problemNo: 8018,
    sourceHtmlSha256:
      "7096ca293d875cff69bdcd949c69ed9a21e2f20671878c4b41a566ab8416dd48",
    sourceUrl:
      "http://img.atwikiimg.com/www46.atwiki.jp/sinapusu2002/attach/355/23/test3.gif",
    reference: "../images/8018/3.gif",
    sha256: "8f73868fffca01c4b93f79ac58b79d6ffcf6d8efb59624908294e0cba8494292",
  },
  {
    problemNo: 8069,
    sourceHtmlSha256:
      "3fedd96ad7c69e43a39b25f8d78daf971117ad71fbbe4d500dd6f0fea62b1c52",
    sourceUrl:
      "http://drive.google.com/uc?export=view&id=1Mw2G9GBcOEmH2wmSBfGiARBm2jI0TSH8",
    reference: "../images/8069/1.png",
    sha256: "d433cd44928f59deab379b629dec2f4bcd9298c668c7d924d30619be1a68eec0",
  },
  {
    problemNo: 3096,
    sourceHtmlSha256:
      "e1854ec35bbc1a0b48b23081004da29d16a551f66884f7e6eb50a788e19d071a",
    sourceUrl:
      "https://github.com/RiRinbaru/compeimgs/blob/main/Snake%20Path/2.png?raw=true",
    reference: "../images/3096/1.png",
    sha256: "938add6f1092dc3ce980a94dceca918b43dce0c363318d1262f77e8d5c5bdb66",
  },
  {
    problemNo: 3096,
    sourceHtmlSha256:
      "e1854ec35bbc1a0b48b23081004da29d16a551f66884f7e6eb50a788e19d071a",
    sourceUrl:
      "https://github.com/RiRinbaru/compeimgs/blob/main/Snake%20Path/cb060d609423d8c6.png?raw=true",
    reference: "../images/3096/2.png",
    sha256: "59182eb7c07876fb49f4bfa25acdd79f9073dc624d3b24300c5a3969b757de1c",
  },
] as const;

/** Materialize only recorded source resources; ordinary image/order checks remain. */
export async function materializeSourceImageSnapshots(
  document: Document,
  originalHtml: string,
  repositoryRoot: string,
  problemNo: number,
  options: ProblemImageResolverOptions = {},
): Promise<void> {
  const hash = createHash("sha256").update(originalHtml).digest("hex");
  const records = remoteProblemImageSnapshots.filter(
    (record) =>
      record.problemNo === problemNo && record.sourceHtmlSha256 === hash,
  );
  for (const record of records) {
    const images = [...document.querySelectorAll("img[src]")].filter(
      (image) => image.getAttribute("src") === record.sourceUrl,
    );
    if (images.length !== 1)
      throw new Error(
        "Source image snapshot URL/count mismatch: " + record.sourceUrl,
      );
    const asset = await readLocalProblemImage(
      repositoryRoot,
      record.reference,
      problemNo,
      options,
    );
    if (asset.sha256 !== record.sha256)
      throw new Error(
        "Source image snapshot SHA-256 mismatch: " + record.reference,
      );
    images[0].setAttribute(
      "src",
      `data:${asset.mime};base64,${Buffer.from(asset.bytes).toString("base64")}`,
    );
  }
}
