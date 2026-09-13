import { isLocalProblemImageReference } from "./problem-assets.ts";

function safeAssetBaseUrl(value: string): URL | undefined {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url : undefined;
  } catch {
    return undefined;
  }
}

export function resolveProblemUrls(
  root: Element,
  sourceUrl: string,
  localAssetBaseUrl?: string,
): void {
  const assetBase =
    localAssetBaseUrl === undefined
      ? undefined
      : safeAssetBaseUrl(localAssetBaseUrl);
  for (const element of [root, ...root.querySelectorAll("[href], [src]")]) {
    for (const name of ["href", "src"]) {
      const value = element.getAttribute(name)?.trim();
      if (value === undefined || value === null) continue;
      if (name === "href" && value.startsWith("#")) continue;
      if (
        name === "src" &&
        element.tagName === "IMG" &&
        isLocalProblemImageReference(value)
      ) {
        if (assetBase)
          element.setAttribute(
            "src",
            new URL(value.slice("../images/".length), `${assetBase.href}/`)
              .href,
          );
        else if (localAssetBaseUrl !== undefined)
          element.removeAttribute("src");
        continue;
      }
      if (
        name === "src" &&
        element.tagName === "IMG" &&
        value.startsWith("../images/")
      ) {
        element.removeAttribute(name);
        continue;
      }
      if (
        name === "src" &&
        element.tagName === "IMG" &&
        (/^data:image\/(?:png|gif|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/u.test(
          value,
        ) ||
          /^data:image\/svg\+xml(?:;charset=[\w-]+)?(?:;base64)?,/iu.test(
            value,
          ))
      )
        // SVG is kept only as an IMG resource, never injected as executable DOM.
        continue;
      try {
        const url = new URL(value, sourceUrl);
        if (!["https:", "http:"].includes(url.protocol))
          throw new Error("Unsupported URL");
        element.setAttribute(name, url.href);
      } catch {
        element.removeAttribute(name);
      }
    }
  }
}
