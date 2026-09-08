import { build } from "esbuild";
import { JSDOM } from "jsdom";
import type { TestContext } from "node:test";
const bundle = await build({
  stdin: {
    resolveDir: process.cwd() + "/tools/review",
    loader: "tsx",
    contents: `
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { Problems } from './public/app/problems.tsx';
import { Glossary } from './public/app/glossary.tsx';
import { Imports } from './public/app/imports.tsx';
import { Tools } from './public/app/tasks.tsx';
import { Comparison } from './public/app/preview.tsx';
import { EditorView } from 'codemirror';
export { screen, fireEvent, waitFor };
let client, router;
export function mount(path, kind) {
 client = new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0},mutations:{retry:false}}});
 router = createMemoryRouter([{path:'/',element:<Problems/>},{path:'/ui',element:kind==='imports'?<Imports/>:<Glossary/>},{path:'/tools',element:<Tools/>},{path:'/preview',element:<Comparison japanese="<p>Original</p>" korean="<p>Translation</p>"/>}],{initialEntries:[path]});
 render(<MantineProvider env="test"><ModalsProvider><QueryClientProvider client={client}><RouterProvider router={router}/></QueryClientProvider></ModalsProvider></MantineProvider>);
 return userEvent.setup({document});
}
export function edit(source){const view=EditorView.findFromDOM(document.querySelector('.cm-editor'));view.dispatch({changes:{from:0,to:view.state.doc.length,insert:source}});}
export function navigate(path){return router.navigate(path);}
export function unmount(){cleanup();router.dispose();client.clear();}
`,
  },
  bundle: true,
  write: false,
  format: "iife",
  globalName: "reviewFixture",
  platform: "browser",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"development"' },
});
export function reactPage(
  t: TestContext,
  fetcher: (path: string, init?: RequestInit) => Promise<Response>,
  path = "/",
  kind = "problems",
) {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: `http://localhost${path}`,
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const w = dom.window;
  Object.assign(w, {
    fetch: fetcher,
    Request,
    Response,
    Headers,
    TextEncoder,
    TextDecoder,
    AbortController,
    AbortSignal,
    structuredClone,
    visualViewport: { addEventListener() {}, removeEventListener() {} },
    ResizeObserver: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
    matchMedia: () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
  w.Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  w.Range.prototype.getBoundingClientRect = () => new w.DOMRect();
  w.HTMLElement.prototype.scrollIntoView = () => {};
  Object.defineProperty(w.document, "fonts", {
    value: { addEventListener() {}, removeEventListener() {} },
  });
  w.eval(bundle.outputFiles[0].text);
  const fixture = (w as unknown as { reviewFixture: any }).reviewFixture;
  const user = fixture.mount(path, kind);
  t.after(() => {
    fixture.unmount();
    w.close();
  });
  return { dom, user, ...fixture } as {
    dom: JSDOM;
    user: any;
    screen: any;
    fireEvent: any;
    waitFor: (f: () => unknown) => Promise<void>;
    edit: (s: string) => void;
    navigate: (s: string) => Promise<void>;
  };
}
