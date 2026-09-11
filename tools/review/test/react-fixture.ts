import { katexStylePlugin } from "../src/katex-style-plugin.ts";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import type { TestContext } from "node:test";
import { MessageChannel } from "node:worker_threads";
import { installStagingSrcdoc } from "./iframe-srcdoc-fixture.ts";
const bundle = await build({
  plugins: [katexStylePlugin],
  stdin: {
    resolveDir: process.cwd() + "/tools/review",
    loader: "tsx",
    contents: `
import React from 'react';
import { act, configure, render, screen, fireEvent, waitFor, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider, Outlet, useSearchParams } from 'react-router-dom';
import { Shell } from './public/app/shell.tsx';
import { Problems } from './public/app/problems.tsx';
import { Glossary } from './public/app/glossary.tsx';
import { Imports } from './public/app/imports.tsx';
import { Tools } from './public/app/tasks.tsx';
import { Tags } from './public/app/tags.tsx';
import { Comparison } from './public/app/preview.tsx';
import { EditorView } from 'codemirror';
export { screen, fireEvent, waitFor, within };
// Shared runners can take more than one second to complete real disk-backed UI requests.
configure({asyncUtilTimeout:10_000});
let client, router;
export function cachedUi(){return client.getQueryData(["/api/ui"]);}
function Ui(){const [params]=useSearchParams();return params.get("view")==="imports"?<Imports/>:<Glossary/>;}
export function mount(path, kind) {
 client = new QueryClient({defaultOptions:{queries:{retry:false,...(kind==="ui"?{staleTime:15000,gcTime:Infinity,refetchOnWindowFocus:false}:{gcTime:0})},mutations:{retry:false}}});
 router = createMemoryRouter([{element:kind==='shell'?<Shell/>:<><div id="review-problem-navigation"/><Outlet/></>,children:[{path:'/',element:<Problems/>},{path:'/ui',element:kind==='ui'?<Ui/>:kind==='imports'?<Imports/>:<Glossary/>},{path:'/tools',element:<Tools/>},{path:'/tags',element:<Tags/>},{path:'/preview',element:<Comparison japanese="<p>Original</p>" korean="<p>Translation</p>"/>}]}],{initialEntries:[path]});
 render(<MantineProvider env="test"><ModalsProvider><QueryClientProvider client={client}><RouterProvider router={router}/></QueryClientProvider></ModalsProvider></MantineProvider>);
 return userEvent.setup({document});
}
export function edit(source){const view=EditorView.findFromDOM(document.querySelector('.cm-editor'));view.dispatch({changes:{from:0,to:view.state.doc.length,insert:source}});}
export function editorView(){return EditorView.findFromDOM(document.querySelector('.cm-editor'));}
export async function navigate(path){await act(async()=>{await router.navigate(path);});}
export function unmount(){cleanup();router.dispose();client.clear();}
`,
  },
  bundle: true,
  write: false,
  format: "iife",
  globalName: "reviewFixture",
  platform: "browser",
  jsx: "automatic",
  define: {
    "process.env.NODE_ENV": '"development"',
    __dirname: '"/mathjax/components"',
  },
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
  installStagingSrcdoc(dom);
  const channels = new Set<MessageChannel>();
  Object.assign(w, {
    // React's async act uses MessageChannel, which JSDOM does not provide.
    MessageChannel: class extends MessageChannel {
      constructor() {
        super();
        channels.add(this);
      }
    },
    fetch: (requestPath: string, init?: RequestInit) =>
      requestPath === "/api/tasks" &&
      kind === "shell" &&
      (!init?.method || init.method === "GET")
        ? Promise.resolve(Response.json([]))
        : fetcher(requestPath, init),
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
    for (const channel of channels) {
      channel.port1.close();
      channel.port2.close();
    }
  });
  return { dom, user, ...fixture } as {
    dom: JSDOM;
    user: any;
    screen: any;
    within: any;
    fireEvent: any;
    waitFor: (f: () => unknown) => Promise<void>;
    edit: (s: string) => void;
    editorView: () => import("codemirror").EditorView;
    navigate: (s: string) => Promise<void>;
    cachedUi: () => { pages: unknown[] };
  };
}
