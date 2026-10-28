import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

process.env.NODE_ENV = "test";
process.env.NPD_SYNC_SECRET = "api-test-npd-secret";

const { app, setTestDatabasePool, setTestTallySyncRunner } = await import("./index.ts");
const { AUTH_SECRET } = await import("./config.ts");

function tokenFor(userId: string) {
  const encode = (value: string) => Buffer.from(value).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const header = encode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = encode(JSON.stringify({ uid: userId, iat: now, exp: now + 3600 }));
  const data = `${header}.${body}`;
  const signature = crypto.createHmac("sha256", AUTH_SECRET).update(data).digest("base64url");
  return `${data}.${signature}`;
}

function createTestPool() {
  const user = {
    id: "api-test-user",
    userId: "api-test-user",
    name: "API Test User",
    email: "api-test@example.invalid",
    role: "Admin",
    status: "Active",
    menuAccess: JSON.stringify(["*"]),
  };
  const query = async (statement: unknown, _values: unknown[] = []) => {
    const sql = typeof statement === "string" ? statement : String((statement as any)?.sql || "");
    if (/SHOW\s+COLUMNS\s+FROM\s+[`]?npd/i.test(sql)) {
      return [["id", "npdId", "itemName", "erp", "erpCode", "syncStatus"].map((Field) => ({ Field })), []];
    }
    if (/SELECT\s+DATABASE\s*\(\)/i.test(sql)) return [[{ databaseName: "api_test_database" }], []];
    if (/information_schema\.TABLES/i.test(sql)) return [[{ TABLE_NAME: "daily_consumptions" }, { TABLE_NAME: "daily_consumption_items" }], []];
    if (/information_schema\.COLUMNS/i.test(sql)) {
      const tableName = String(_values[1] || "");
      const columns = tableName === "daily_consumption_items"
        ? ["id", "dailyConsumptionId", "materialId", "qty", "uom", "lastPurchaseRate", "openingRate", "rate", "amount", "updatedBy", "updateTimestamp"]
        : ["id", "issueNo", "consumptionTransactionNo", "date", "issueType", "firmId", "remarks", "notApplicable", "tallyTimestamp", "tallyPostingStatus", "tallyVoucherNo", "tallyVoucherDate", "tallyVoucherType", "tallyVoucherId", "tallyPostedBy", "tallyPostingRemark", "tallyPostingError", "tallyLastAttemptAt", "tallyPostingAttemptCount", "updatedBy", "updateTimestamp"];
      return [columns.map((COLUMN_NAME) => ({ COLUMN_NAME })), []];
    }
    if (/GET_LOCK/i.test(sql)) return [[{ acquired: 1 }], []];
    if (/SELECT\s+COUNT\s*\(/i.test(sql)) return [[{ count: 0, total: 0 }], []];
    if (/FROM\s+[`]?users[`]?\s+WHERE/i.test(sql)) return [[user], []];
    if (/FROM\s+[`]?users[`]?\s+LIMIT/i.test(sql)) return [[user], []];
    if (/SELECT\s+id\s+FROM\s+[`]?firms/i.test(sql)) return [[{ id: "api-test-firm" }], []];
    if (/FROM\s+[`]?suppliers[`]?/i.test(sql)) return [[{ gstSupplyType: "INTRA_STATE" }], []];
    if (/FROM\s+indent_lines\s+il/i.test(sql)) return [[{ id: "api-test-indent-line", indentId: "api-test-indent", erpCode: "API", qty: 1, cancelledQty: 0, orderedQty: 0, targetDeliveryDate: "2026-10-28", requisitionDate: "2026-10-28", poQtyCreated: 0 }], []];
    if (/^\s*SELECT/i.test(sql)) return [[], []];
    return [{ affectedRows: 1, insertId: 1 }, []];
  };
  const connection = {
    query,
    beginTransaction: async () => undefined,
    commit: async () => undefined,
    rollback: async () => undefined,
    release: () => undefined,
  };
  return {
    query,
    getConnection: async () => connection,
    on: () => undefined,
  } as any;
}

function discoverApiRoutes(source: string) {
  const routes: { method: string; path: string; source: string }[] = [];
  for (const match of source.matchAll(/app\.(get|post|put|patch|delete)\((['"`])([^'"`]+)\2/g)) {
    routes.push({ method: match[1].toUpperCase(), path: match[3], source: "explicit" });
  }
  const entityMatch = source.match(/const entities = \[(.*?)\];/s);
  for (const entity of entityMatch?.[1]?.matchAll(/"([^"]+)"/g) || []) {
    const route = `/api/${entity[1].replaceAll("_", "-")}`;
    routes.push({ method: "GET", path: route, source: "generic" });
    routes.push({ method: "POST", path: route, source: "generic" });
    routes.push({ method: "DELETE", path: `${route}/:id`, source: "generic" });
  }
  return [...new Map(routes.map((route) => [`${route.method}|${route.path}`, route])).values()]
    .filter((route) => !route.path.includes("/realtime/updates") && route.path !== "*" && !route.path.includes("${route}"))
    .sort((a, b) => `${a.path}|${a.method}`.localeCompare(`${b.path}|${b.method}`));
}

function concretePath(routePath: string) {
  return routePath.replace(/:([A-Za-z0-9_]+)/g, "api-test-id");
}

const sourcePath = path.join(path.dirname(fileURLToPath(import.meta.url)), "index.ts");
const source = await fs.readFile(sourcePath, "utf8");
const apiRoutes = discoverApiRoutes(source);

describe("API route contract smoke matrix", () => {
  it("executes the configured isolated HTTP transitions for every discovered API route", async () => {
    setTestDatabasePool(createTestPool());
    setTestTallySyncRunner(async () => ({ stdout: "test tally sync complete", stderr: "" }));
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as { port: number };
    const authToken = tokenFor("api-test-user");
    const transitionTemplates = [
      { name: "missing-auth", headers: {} },
      { name: "malformed-auth", headers: { authorization: "Bearer malformed-token" } },
      { name: "valid-auth", headers: { authorization: `Bearer ${authToken}` } },
      { name: "valid-auth-firm-scope", headers: { authorization: `Bearer ${authToken}`, "x-firm-id": "api-test-firm" } },
      { name: "valid-auth-query-variation", headers: { authorization: `Bearer ${authToken}` }, suffix: "?transition=variation" },
    ];
    const requestedTransitionCount = Math.max(5, Number(process.env.API_TRANSITIONS_PER_ROUTE || 5));
    const transitions = Array.from({ length: requestedTransitionCount }, (_, index) => {
      const template = transitionTemplates[index % transitionTemplates.length];
      const run = Math.floor(index / transitionTemplates.length);
      const suffix = template.suffix ? `${template.suffix}&run=${run}` : `?run=${run}`;
      return { ...template, name: run === 0 ? template.name : `${template.name}-run-${run}`, suffix };
    });
    const results: any[] = [];
    const capturedErrors: string[] = [];
    const originalConsole = { log: console.log, warn: console.warn, error: console.error };
    console.log = () => undefined;
    console.warn = () => undefined;
    console.error = (...args: unknown[]) => capturedErrors.push(args.map((arg) => {
      if (typeof arg === "string") return arg;
      try { return JSON.stringify(arg); } catch { return String(arg); }
    }).join(" ").slice(0, 500));
    try {
      for (const route of apiRoutes) {
        for (const transition of transitions) {
          const url = `http://127.0.0.1:${address.port}${concretePath(route.path)}${transition.suffix || ""}`;
          const integrationHeaders = route.path.startsWith("/api/npd-sync")
            ? { "x-npd-sync-secret": "api-test-npd-secret" }
            : {};
          const init: RequestInit = { method: route.method, headers: { ...transition.headers, ...integrationHeaders }, signal: AbortSignal.timeout(5000) };
          if (["POST", "PUT", "PATCH"].includes(route.method)) {
            init.headers = { ...transition.headers, ...integrationHeaders, "content-type": "application/json" };
            init.body = route.path === "/api/purchase-orders/create-consolidated"
              ? JSON.stringify({ supplierId: "api-test-supplier", items: [{ materialId: "api-test-material", uom: "NOS", orderQty: 1, rate: 1 }] })
              : JSON.stringify({});
          }
          try {
            const response = await fetch(url, init);
            const responseBody = await response.text();
            results.push({
              ...route,
              transition: transition.name,
              status: response.status,
              result: response.status < 500 ? "PASS" : "SERVER_ERROR",
              ...(response.status >= 500 && responseBody ? { response: responseBody.slice(0, 500) } : {}),
            });
          } catch (error) {
            results.push({ ...route, transition: transition.name, status: 0, result: "FAIL", error: String((error as Error).message || error) });
          }
        }
      }
    } finally {
      console.log = originalConsole.log;
      console.warn = originalConsole.warn;
      console.error = originalConsole.error;
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      setTestDatabasePool(null);
      setTestTallySyncRunner(null);
    }

    const outputDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../test-results");
    await fs.mkdir(outputDir, { recursive: true });
    const failures = results.filter((result) => result.result === "FAIL");
    const report = { generatedAt: new Date().toISOString(), routeCount: apiRoutes.length, transitionCount: transitions.length, results, capturedErrors: capturedErrors.slice(-50) };
    await fs.writeFile(path.join(outputDir, "api-transition-results.json"), JSON.stringify(report, null, 2));
    const markdown = [
      "# API Transition Test Results",
      "",
      `Generated: ${report.generatedAt}`,
      `Concrete API routes tested: ${report.routeCount}`,
      `Transitions per route: ${report.transitionCount}`,
      `Total HTTP transitions: ${results.length}`,
      `Transport failures: ${failures.length}`,
      `Completed responses: ${results.filter((result) => result.result !== "FAIL").length}`,
      "",
      "A `SERVER_ERROR` row means the route responded with HTTP 5xx; it is retained for investigation and is not treated as a transport failure. The long-lived `/api/realtime/updates` SSE route is excluded from this finite-response matrix.",
      "",
      "| Method | Route | Source | Five transition statuses | Result |",
      "|---|---|---|---|---|",
      ...apiRoutes.map((route) => {
        const rows = results.filter((result) => result.method === route.method && result.path === route.path);
        const statuses = rows.map((row) => `${row.transition}: ${row.status}`).join("; ");
        const result = rows.every((row) => row.result === "PASS") ? "PASS" : rows.some((row) => row.result === "FAIL") ? "FAIL" : "SERVER_ERROR";
        return `| ${route.method} | \`${route.path}\` | ${route.source} | ${statuses} | ${result} |`;
      }),
      "",
      "## Server-error endpoints",
      "",
      ...[...new Set(results.filter((result) => result.result === "SERVER_ERROR").map((result) => `${result.method} ${result.path}`))].map((route) => `- ${route}`),
    ].join("\n");
    await fs.writeFile(path.join(outputDir, "api-transition-results.md"), markdown);
    assert.equal(failures.length, 0, `${failures.length} API transitions failed; see test-results/api-transition-results.json`);
  });
});
