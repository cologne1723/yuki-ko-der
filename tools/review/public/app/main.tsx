import { Button, MantineProvider, Stack, Text, Title } from "@mantine/core";
import "@mantine/core/styles.css";
import { ModalsProvider } from "@mantine/modals";
import { Notifications } from "@mantine/notifications";
import "@mantine/notifications/styles.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  createBrowserRouter,
  RouterProvider,
  useSearchParams,
} from "react-router-dom";
import { Glossary } from "./glossary.tsx";
import { Imports } from "./imports.tsx";
import { Shell } from "./shell.tsx";
import { Problems } from "./problems.tsx";
import { Failure } from "./shared.tsx";
import { Tools } from "./tasks.tsx";

export class ErrorBoundary extends Component<
  { children: ReactNode },
  { error?: Error }
> {
  state: { error?: Error } = {};
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    return this.state.error ? (
      <Stack p="xl">
        <Title order={1}>화면을 표시하지 못했습니다</Title>
        <Failure error={this.state.error} />
        <Text>오류를 확인한 뒤 화면을 다시 시도하세요.</Text>
        <Button onClick={() => this.setState({ error: undefined })}>
          화면 다시 시도
        </Button>
      </Stack>
    ) : (
      this.props.children
    );
  }
}
function Ui() {
  const [params] = useSearchParams();
  return params.get("view") === "imports" ? <Imports /> : <Glossary />;
}
export function createReviewRouter() {
  return createBrowserRouter([
    {
      element: <Shell />,
      errorElement: (
        <Failure
          error={
            new Error(
              "페이지를 표시하지 못했습니다. 주소를 확인하고 다시 시도하세요.",
            )
          }
        />
      ),
      children: [
        { path: "/", element: <Problems /> },
        { path: "/ui", element: <Ui /> },
        { path: "/tools", element: <Tools /> },
      ],
    },
  ]);
}
const client = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 15000, refetchOnWindowFocus: false },
    mutations: { retry: false },
  },
});
createRoot(document.getElementById("root")!).render(
  <MantineProvider
    defaultColorScheme="light"
    theme={{
      primaryColor: "indigo",
      defaultRadius: "md",
      fontFamily: "system-ui, sans-serif",
    }}
  >
    <ModalsProvider>
      <Notifications />
      <ErrorBoundary>
        <QueryClientProvider client={client}>
          <RouterProvider router={createReviewRouter()} />
        </QueryClientProvider>
      </ErrorBoundary>
    </ModalsProvider>
  </MantineProvider>,
);
