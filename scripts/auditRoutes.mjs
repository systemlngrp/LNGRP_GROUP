import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appSource = await fs.readFile(path.join(root, "src/App.tsx"), "utf8");
const serverSource = await fs.readFile(path.join(root, "server/index.ts"), "utf8");
const layoutSource = await fs.readFile(path.join(root, "src/components/Layout.tsx"), "utf8");
const hasRouteBoundary = layoutSource.includes("DataLoadingBoundary") && layoutSource.includes("Suspense");
const hasFallbackRoute = appSource.includes('<Route path="*"');

const lazyModules = new Map();
for (const match of appSource.matchAll(/const\s+(\w+)\s*=\s*lazy\(\(\)\s*=>\s*import\("([^"]+)"\)/g)) {
  lazyModules.set(match[1], match[2]);
}

const routes = [];
for (const match of appSource.matchAll(/<Route\s+path="([^"]+)"\s+element=\{<([A-Za-z0-9]+)[^>]*\s*\/?\s*>\}/g)) {
  routes.push({ path: match[1], component: match[2] });
}
for (const match of appSource.matchAll(/<Route\s+index\s+element=\{<([A-Za-z0-9]+)[^>]*\s*\/?\s*>\}/g)) {
  routes.push({ path: "/", component: match[1] });
}

const apiRoutes = [];
for (const match of serverSource.matchAll(/app\.(get|post|put|patch|delete)\((['"`])([^'"`]+)\2/g)) {
  apiRoutes.push({ method: match[1].toUpperCase(), path: match[3], source: "explicit" });
}

const entityMatch = serverSource.match(/const entities = \[(.*?)\];/s);
if (entityMatch) {
  for (const entity of entityMatch[1].matchAll(/"([^"]+)"/g)) {
    const route = `/api/${entity[1].replaceAll("_", "-")}`;
    apiRoutes.push({ method: "GET", path: route, source: "generic" });
    apiRoutes.push({ method: "POST", path: route, source: "generic" });
    apiRoutes.push({ method: "DELETE", path: `${route}/:id`, source: "generic" });
  }
}

const uniqueRoutes = [...new Map(routes.map((route) => [`${route.path}|${route.component}`, route])).values()]
  .sort((a, b) => a.path.localeCompare(b.path));
const uniqueApis = [...new Map(apiRoutes.map((route) => [`${route.method}|${route.path}`, route])).values()]
  .filter((route) => route.path !== "*" && !route.path.includes("${route}"))
  .sort((a, b) => `${a.path}|${a.method}`.localeCompare(`${b.path}|${b.method}`));

const moduleResults = new Map();
for (const modulePath of new Set(lazyModules.values())) {
  const filePath = path.resolve(root, "src", `${modulePath.replace(/^\.\//, "")}.tsx`);
  try {
    await import(pathToFileURL(filePath).href);
    moduleResults.set(modulePath, { status: "PASS" });
  } catch (error) {
    moduleResults.set(modulePath, { status: "FAIL", detail: String(error?.message || error) });
  }
}

const transitionChecks = ["route declaration", "component target", "lazy module import", "auth/loading boundary", "fallback route"];
const routeRows = uniqueRoutes.map((route) => {
  const modulePath = lazyModules.get(route.component);
  const componentTarget = Boolean(modulePath) || new RegExp(`import\\s+\\{[^}]*\\b${route.component}\\b[^}]*\\}\\s+from`).test(appSource) || new RegExp(`(?:function|const)\\s+${route.component}\\b`).test(appSource) || route.component === "Navigate";
  const importStatus = modulePath ? moduleResults.get(modulePath)?.status || "FAIL" : "PASS";
  const checks = ["PASS", componentTarget ? "PASS" : "FAIL", importStatus, hasRouteBoundary ? "PASS" : "FAIL", hasFallbackRoute ? "PASS" : "FAIL"].join(" / ");
  const result = checks.includes("FAIL") ? "FAIL" : "PASS";
  return `| \`${route.path}\` | \`${route.component}\` | ${result} | ${checks} |`;
});
const apiRows = uniqueApis.map((route) => `| ${route.method} | \`${route.path}\` | PASS | Registered (${route.source}) | Not run: isolated Express/DB seam required |`);
let liveApiReport = null;
try {
  liveApiReport = JSON.parse(await fs.readFile(path.join(root, "test-results/api-transition-results.json"), "utf8"));
} catch {
  // The static audit can run before the live matrix has generated its report.
}
const liveRowsByRoute = new Map();
for (const result of liveApiReport?.results || []) {
  const key = `${result.method}|${result.path}`;
  liveRowsByRoute.set(key, [...(liveRowsByRoute.get(key) || []), result]);
}
const apiLiveRows = uniqueApis.map((route) => {
  const rows = liveRowsByRoute.get(`${route.method}|${route.path}`) || [];
  const status = rows.length === 0 ? "NOT RUN" : rows.every((row) => row.result === "PASS") ? "PASS" : rows.some((row) => row.result === "FAIL") ? "FAIL" : "SERVER_ERROR";
  const detail = rows.length === 0 ? "Not run" : `${rows.length} transitions; statuses ${[...new Set(rows.map((row) => row.status))].join(", ")}`;
  return `| ${route.method} | \`${route.path}\` | PASS | Registered (${route.source}) | ${status}: ${detail} |`;
});
const passedRoutes = uniqueRoutes.filter((route) => {
  const modulePath = lazyModules.get(route.component);
  const componentTarget = Boolean(modulePath) || new RegExp(`import\\s+\\{[^}]*\\b${route.component}\\b[^}]*\\}\\s+from`).test(appSource) || new RegExp(`(?:function|const)\\s+${route.component}\\b`).test(appSource) || route.component === "Navigate";
  return componentTarget && hasRouteBoundary && hasFallbackRoute && (!modulePath || moduleResults.get(modulePath)?.status === "PASS");
}).length;

const output = [
  "# Route and API Audit", "", `Generated: ${new Date().toISOString()}`, "",
  "Static route/module checks are separated from live API transition tests.", "",
  "## Summary", "", `- UI routes discovered: **${uniqueRoutes.length}**`,
  `- API registrations discovered: **${uniqueApis.length}**`,
  `- Route static/module checks: **${passedRoutes}/${uniqueRoutes.length}** passed`,
  `- API live transition tests: **${liveApiReport ? `${liveApiReport.results.length} transitions across ${liveApiReport.routeCount} routes` : "not run"}**`,
  `- Transition matrix: **${transitionChecks.join(", ")}**`, "",
  "## UI Routes", "",
  "| Route | Component | Result | Checks (declaration / target / import / boundary / fallback) |",
  "|---|---|---|---|", ...routeRows, "", "## APIs", "",
  "| Method | Endpoint | Registration | Source | Live test status |",
  "|---|---|---|---|---|", ...apiLiveRows, "", "## Notes", "",
  "- The live matrix uses an isolated Express server and mocked database pool; it does not touch production data.",
  "- The long-lived `/api/realtime/updates` SSE endpoint is excluded from the finite-response matrix.",
  "- HTTP 5xx responses are retained as `SERVER_ERROR` findings in the live report; transport timeouts are test failures.", "",
].join("\n");

const outputDir = path.join(root, "test-results");
await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(path.join(outputDir, "route-api-audit.md"), output, "utf8");
console.log(`Wrote ${path.join("test-results", "route-api-audit.md")}`);
console.log(`UI routes: ${uniqueRoutes.length}; APIs: ${uniqueApis.length}; module failures: ${[...moduleResults.values()].filter((result) => result.status === "FAIL").length}`);
