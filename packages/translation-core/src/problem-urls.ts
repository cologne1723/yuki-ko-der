export function resolveProblemUrls(root: Element, sourceUrl: string): void {
  for (const element of [root, ...root.querySelectorAll("[href], [src]")]) {
    for (const name of ["href", "src"]) {
      const value = element.getAttribute(name)?.trim();
      if (value === undefined || value === null) continue;
      if (name === "href" && value.startsWith("#")) continue;
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
