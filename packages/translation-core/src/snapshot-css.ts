import {
  generate,
  parse,
  walk,
  type CssNode,
  type List,
  type ListItem,
} from "css-tree";

/** Preserve layout rules while removing declarations that can load resources. */
export function sanitizeSnapshotCss(source: string, inline = false): string {
  try {
    const ast = parse(source, {
      context: inline ? "declarationList" : "stylesheet",
      parseCustomProperty: true,
      onParseError(error) {
        throw error;
      },
    });
    walk(ast, {
      enter(node: CssNode, item: ListItem<CssNode>, list: List<CssNode>) {
        if (node.type === "Atrule") {
          // Imports, font sources and unknown at-rules are unnecessary in an inert snapshot.
          if (
            ![
              "media",
              "supports",
              "layer",
              "container",
              "keyframes",
              "-webkit-keyframes",
              "scope",
            ].includes(node.name.toLowerCase())
          ) {
            if (item) list.remove(item);
            return walk.skip;
          }
        }
        if (node.type === "Declaration") {
          let unsafe = false;
          walk(node.value, (value: CssNode) => {
            if (
              value.type === "Url" ||
              value.type === "Raw" ||
              (value.type === "Function" &&
                ![
                  "var",
                  "env",
                  "calc",
                  "min",
                  "max",
                  "clamp",
                  "rgb",
                  "rgba",
                  "hsl",
                  "hsla",
                  "hwb",
                  "lab",
                  "lch",
                  "oklab",
                  "oklch",
                  "color",
                  "color-mix",
                  "linear-gradient",
                  "radial-gradient",
                  "conic-gradient",
                  "repeating-linear-gradient",
                  "repeating-radial-gradient",
                  "translate",
                  "translatex",
                  "translatey",
                  "translatez",
                  "translate3d",
                  "scale",
                  "scalex",
                  "scaley",
                  "scalez",
                  "scale3d",
                  "rotate",
                  "rotatex",
                  "rotatey",
                  "rotatez",
                  "rotate3d",
                  "skew",
                  "skewx",
                  "skewy",
                  "matrix",
                  "matrix3d",
                  "perspective",
                  "cubic-bezier",
                  "steps",
                  "repeat",
                  "minmax",
                  "fit-content",
                ].includes(value.name.toLowerCase()))
            )
              unsafe = true;
          });
          if (unsafe && item) list.remove(item);
          return walk.skip;
        }
      },
    });
    return generate(ast);
  } catch {
    return "";
  }
}
