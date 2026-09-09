const pageDictionaries: Record<string, string[]> = {
  "/": ["main"],
  "/challenges": ["challenges"],
  "/clarifications": ["clarifications"],
  "/contests": ["contests"],
  "/contests/calendar": ["contests", "contests_calendar"],
  "/help": ["help"],
  "/help/environments": ["help", "help_environments"],
  "/help/team_contest": ["help", "help_team_contest"],
  "/offer": ["offer_shared", "offer"],
  "/offer/exec": ["offer_shared", "offer_exec"],
  "/problems": ["problems"],
  "/problems/educational": ["problems", "problems_educational"],
  "/problems/mathematical": ["problems", "problems_mathematical"],
  "/problems/other": ["problems", "problems_other"],
  "/problems/outstanding": ["problems", "problems_outstanding"],
  "/problems/scoring": ["problems", "problems_scoring"],
  "/problems/shortcode": ["problems", "problems_shortcode"],
  "/problemsets": ["problemsets"],
  "/ranking": ["ranking"],
  "/ranking/golfer": ["ranking", "ranking_golfer"],
  "/ranking/level": ["ranking", "ranking_level"],
  "/ranking/point": ["ranking", "ranking_point"],
  "/ranking/pure_golfer": ["ranking", "ranking_pure_golfer"],
  "/ranking/score": ["ranking", "ranking_score"],
  "/ranking/speeder": ["ranking", "ranking_speeder"],
  "/ranking/yuru": ["ranking", "ranking_yuru"],
  "/run": ["run"],
  "/run/history": ["run", "run_history"],
  "/statistics": ["statistics"],
  "/statistics/code_holders": ["statistics", "statistics_code_holders"],
  "/statistics/language_speed": ["statistics", "statistics_language_speed"],
  "/statistics/tags": ["statistics", "statistics_tags"],
  "/statistics/wait_problems": ["statistics", "statistics_wait_problems"],
  "/submissions": ["submissions"],
  "/supporter": ["supporter"],
  "/tester_problems": ["tester_problems"],
  "/wiki": ["wiki_shared", "wiki"],
  "/wiki/index": ["wiki_shared", "wiki"],
  "/wiki/guide": ["wiki_shared", "guide"],
};
const dynamicPageDictionaries = [
  { pattern: /^\/challenge\/\d+$/u, names: ["challenges"] },
  { pattern: /^\/contests\/\d+$/u, names: ["contest"] },
  {
    pattern: /^\/contests\/\d+\/(?:table|all)$/u,
    names: ["contest", "contest_table"],
  },
  {
    pattern: /^\/contests\/table-beta\/\d+$/u,
    names: ["contest", "contest_table", "contest_table_beta"],
  },
  {
    pattern: /^\/contests\/\d+\/statistics$/u,
    names: ["contest", "problem_statistics", "contest_statistics"],
  },
  {
    pattern: /^\/contests\/\d+\/submissions$/u,
    names: ["contest", "submissions", "contest_submissions"],
  },
  {
    pattern: /^\/contests\/\d+\/clarifications$/u,
    names: ["contest", "contest_clarifications"],
  },
  {
    pattern: /^\/contests\/\d+\/editorial$/u,
    names: ["contest", "contest_editorial"],
  },
  { pattern: /^\/problemsets\/\d+$/u, names: ["problemset"] },
  {
    pattern: /^\/problems\/\d+\/favorite_users$/u,
    names: ["problem_favorite_users"],
  },
  { pattern: /^\/problems\/\d+$/u, names: ["problem"] },
  { pattern: /^\/problems\/no\/\d+$/u, names: ["problem"] },
  {
    pattern: /^\/problems\/no\/\d+\/submit$/u,
    names: ["problem", "problem_submit"],
  },
  {
    pattern: /^\/problems\/no\/\d+\/submissions$/u,
    names: ["problem", "submissions"],
  },
  {
    pattern: /^\/problems\/no\/\d+\/clarifications$/u,
    names: ["problem", "problem_tools", "problem_clarifications"],
  },
  {
    pattern: /^\/problems\/no\/\d+\/statistics$/u,
    names: ["problem", "problem_statistics"],
  },
  {
    pattern: /^\/problems\/no\/\d+\/editorial$/u,
    names: ["problem", "problem_editorial"],
  },
  {
    pattern: /^\/problems\/no\/\d+\/test$/u,
    names: ["problem", "problem_tools"],
  },
  {
    pattern: /^\/problems\/no\/\d+\/code$/u,
    names: ["problem", "problem_tools"],
  },
  {
    pattern: /^\/problems\/no\/\d+\/gen$/u,
    names: ["problem", "problem_tools"],
  },
  { pattern: /^\/run\/[a-z0-9]+$/u, names: ["run"] },
  { pattern: /^\/submissions\/\d+$/u, names: ["submission"] },
  {
    pattern: /^\/users\/\d+\/problems$/u,
    names: ["user", "problems", "user_problems"],
  },
  {
    pattern: /^\/users\/\d+\/submissions$/u,
    names: ["user", "submissions", "user_submissions"],
  },
  {
    pattern: /^\/users\/\d+\/points$/u,
    names: ["user", "ranking_yuru", "user_points"],
  },
  {
    pattern: /^\/users\/\d+\/level_suggestion$/u,
    names: ["user", "user_level_suggestion"],
  },
  {
    pattern: /^\/users\/\d+\/editorial$/u,
    names: ["user", "user_editorial"],
  },
  {
    pattern: /^\/users\/\d+\/clarification_no_response$/u,
    names: ["user", "user_clarifications"],
  },
  {
    pattern: /^\/users\/\d+\/tester_problems$/u,
    names: ["user", "tester_problems", "user_tester_problems"],
  },
  { pattern: /^\/users\/\d+\/favorite$/u, names: ["user", "user_favorite"] },
  {
    pattern: /^\/users\/\d+\/favoriteProblem$/u,
    names: ["user", "problems", "user_favorite_problem"],
  },
  {
    pattern: /^\/users\/\d+\/favoriteWiki$/u,
    names: ["user", "user_favorite_wiki"],
  },
  {
    pattern: /^\/users\/\d+\/rejudge$/u,
    names: ["user", "problems", "user_rejudge"],
  },
  { pattern: /^\/users\/\d+$/u, names: ["user"] },
  { pattern: /^\/wiki\/[^/]+\/edit$/u, names: ["wiki_shared", "wiki_edit"] },
  { pattern: /^\/wiki\/[^/]+$/u, names: ["wiki_shared", "wiki"] },
];

export function pageDictionaryNames(pathname: string): string[] {
  const names =
    pageDictionaries[pathname] ??
    dynamicPageDictionaries.find(({ pattern }) => pattern.test(pathname))
      ?.names ??
    [];
  return ["common", ...names, "shared"];
}
