import { AppShell, Burger, Group, NavLink, Stack, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { Link, Outlet, useLocation } from "react-router-dom";
import { TaskMonitor } from "./tasks.tsx";

export function Shell() {
  const [opened, { toggle, close, open }] = useDisclosure();
  const location = useLocation();
  return (
    <AppShell
      header={{ height: 64 }}
      navbar={{
        width: location.pathname === "/" ? 340 : 220,
        breakpoint: "md",
        collapsed: { mobile: !opened, desktop: !opened },
      }}
      padding="lg"
    >
      <AppShell.Header>
        <Group h="100%" px="lg" wrap="nowrap">
          <Burger
            opened={opened}
            onClick={toggle}
            aria-label="탐색 메뉴"
            aria-expanded={opened}
            aria-controls="review-navigation"
          />
          <Text fw={700} size="lg" style={{ flexShrink: 0 }}>
            번역 검수
          </Text>
          <Text size="sm" c="dimmed" visibleFrom="sm">
            편집 · 검수 · 자료 관리
          </Text>
          <TaskMonitor />
        </Group>
      </AppShell.Header>
      <AppShell.Navbar
        id="review-navigation"
        p="md"
        style={{ overflowY: "auto" }}
      >
        <Stack gap="xs">
          {[
            ["/", "문제 목록"],
            ["/ui", "UI 용어집"],
            ["/ui?view=imports", "ZIP 가져오기"],
            ["/tools", "도구와 설정"],
          ].map(([to, label]) => (
            <NavLink
              key={to}
              component={Link}
              to={to}
              label={label}
              active={
                `${location.pathname}${new URLSearchParams(location.search).get("view") === "imports" ? "?view=imports" : ""}` ===
                to
              }
              onClick={to === "/" ? open : close}
            />
          ))}
        </Stack>
        <div id="review-problem-navigation" style={{ marginTop: 16 }} />
      </AppShell.Navbar>
      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
