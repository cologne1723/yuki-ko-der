import { JSDOM } from "jsdom";
import { validateHtmlWithWindow } from "./problem-html-validation.ts";

export function validateStaticHtml(html: string): void {
  const dom = new JSDOM("");
  try {
    validateHtmlWithWindow(html, dom.window);
  } finally {
    dom.window.close();
  }
}
