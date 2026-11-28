import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { generateFirmShortName } from "../lib/firmDisplay";

export type AuthUser = {
  id: string;
  userId: string;
  name: string;
  email?: string | null;
  role: string;
  status: "Active" | "Inactive";
  menuAccess: string[];
  truckId?: string | null;
};

export type ActiveFirm = {
  id: string;
  firmName: string;
  shortName?: string | null;
  logo?: string | null;
  tallyPortNo?: string | null;
};

type AuthContextValue = {
  user: AuthUser | null;
  activeFirm: ActiveFirm | null;
  activeFirmId: string;
  loading: boolean;
  authError: string | null;
  retryAuth: () => void;
  login: (identifier: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  setActiveFirm: (firm: ActiveFirm | null) => void;
  hasAccess: (href: string) => boolean;
  /** Page guard: menu access plus pages reached by a button or after Save. */
  canOpenPage: (href: string) => boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const TRUCK_DRIVER_ALLOWED_PATHS = ["/truck/status-update"];
const ACTIVE_FIRM_STORAGE_KEY = "activeFirm";

function normalizeActiveFirm(raw: unknown): ActiveFirm | null {
  if (!raw) return null;
  const value = typeof raw === "string" ? (() => {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  })() : raw;
  const id = String((value as any)?.id || "").trim();
  const firmName = String((value as any)?.firmName || "").trim();
  if (!id || !firmName) return null;
  return {
    id,
    firmName,
    shortName: (value as any)?.shortName ? String((value as any).shortName) : generateFirmShortName(firmName),
    logo: (value as any)?.logo ? String((value as any).logo) : null,
    tallyPortNo: (value as any)?.tallyPortNo ? String((value as any).tallyPortNo) : null,
  };
}

function normalizeMenuAccess(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    const list = raw.map((v) => String(v)).filter(Boolean);
    if (list.includes("/masters/settings") && !list.includes("/masters/machines")) {
      list.push("/masters/machines");
    }
    if (list.includes("/masters/colors") && !list.includes("/masters/flutes")) {
      list.push("/masters/flutes");
    }
    return list;
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        const list = parsed.map((v) => String(v)).filter(Boolean);
        if (list.includes("/masters/settings") && !list.includes("/masters/machines")) {
          list.push("/masters/machines");
        }
        if (list.includes("/masters/colors") && !list.includes("/masters/flutes")) {
          list.push("/masters/flutes");
        }
        return list;
      }
    } catch {
      // ignore
    }
  }
  return [];
}

function normalizeRole(raw: unknown): AuthUser["role"] {
  const role = String(raw || "Employee").trim();
  return role || "Employee";
}

function getEffectiveMenuAccess(user: AuthUser | null) {
  if (!user) return [];
  if (user.role === "TruckDriver") return TRUCK_DRIVER_ALLOWED_PATHS;
  return normalizeMenuAccess(user.menuAccess);
}

const TALLY_POSTING_TAB_PATHS = ["/material-receipt/pending-tally", "/material-receipt/pending-credit-note", "/material-receipt/pending-debit-note"];

function isDirectlyAllowed(user: AuthUser | null, href: string) {
  if (!user) return false;
  if (href === "/") return true;
  if (user.role === "Admin") return true;
  if (user.status !== "Active") return false;
  if (user.role === "TruckDriver") return href === "/" || TRUCK_DRIVER_ALLOWED_PATHS.includes(href);
  // Home only lists the pages this user may open, so every active user may see it.
  if (href === "/home") return true;
  const list = getEffectiveMenuAccess(user);
  if (list.includes("*")) return true;
  if (href === "/material-movement/reel-transfer" && list.includes("/material-movement/issue")) return true;
  // Tally Posting page = MRR / credit note / debit note tally posting tabs.
  if (href === "/material-receipt/tally-posting" && TALLY_POSTING_TAB_PATHS.some((path) => list.includes(path))) return true;
  if (TALLY_POSTING_TAB_PATHS.includes(href) && list.includes("/material-receipt/tally-posting")) return true;
  if (
    href === "/production/pending-material-return" &&
    ["/production/pending-consumption", "/material-movement/return", "/material-movement/reel-return"].some((path) => list.includes(path))
  ) return true;
  if (
    href === "/production/pending-job-transfer" &&
    ["/material-movement/reel-transfer", "/material-movement/issue"].some((path) => list.includes(path))
  ) return true;
  if (
    href === "/material-movement/reel-transfer" &&
    list.includes("/production/pending-job-transfer")
  ) return true;
  if (
    ["/material-movement/reel-return", "/material-movement/reel-return/qr"].includes(href) &&
    ["/material-movement/return", "/production/pending-material-return"].some((path) => list.includes(path))
  ) return true;
  if (
    href === "/production-processing/form" &&
    ["/production/pending-machine-processing", "/production/pending-printing", "/production-processing/master"].some((path) => list.includes(path))
  ) {
    return true;
  }
  if (href === "/truck/logs" && list.includes("/reports/truck-status")) return true;
  // Direct Service has its own form now; whoever could open it before (from
  // Pending Material Receipt or the Material Receipt form) still can.
  if (
    href === "/material-in/direct-service" &&
    ["/material-in/form", "/material-receipt/pending-mrr"].some((path) => list.includes(path))
  ) return true;
  if (!href) return false;
  return list.some((entry) => {
    if (!entry) return false;
    if (entry === href) return true;
    if (entry !== "/" && href.startsWith(`${entry}/`)) return true;
    if (href !== "/" && entry.startsWith(`${href}/`)) return true;
    if (entry.endsWith("/*") && href.startsWith(entry.slice(0, -1))) return true;
    return false;
  });
}

// Pages opened by a button on another page, and the page a form returns to
// after Save. Whoever can open one of the listed source pages may open the
// target too, so buttons and post-save screens never show Unauthorized.
// Key = target page (also covers its sub-paths like /indent/view/:id).
const RELATED_PAGE_ACCESS: Record<string, string[]> = {
  // Buttons -> forms / detail pages
  "/production/form": ["/production/pending", "/production/upcoming"],
  "/production-processing/form": ["/production/pending-machine-processing", "/production/pending-printing", "/production-processing/master", "/production/pending-job-closure"],
  "/material-movement/issue": ["/production/pending-consumption"],
  "/material-movement/reel-transfer": ["/production/pending-job-transfer", "/material-movement/issue"],
  "/material-movement/daily-consumption": ["/material-movement/pending-non-job-issue"],
  "/material-movement/reel-issue-return-scan/form": ["/material-movement/reel-issue-return-scan", "/production/pending-consumption"],
  "/material-movement/reel-issue-return": ["/production/pending-consumption", "/material-movement/reel-issue-return-scan"],
  "/material-movement/reel-return/qr": ["/material-movement/reel-return", "/material-movement/return", "/production/pending-material-return"],
  "/material-in/form": ["/material-receipt/pending-mrr", "/material-in/item-master", "/material-in/master"],
  "/material-in/direct-service": ["/material-in/form", "/material-receipt/pending-mrr"],
  "/gate-entry/form": ["/gate-entry/master", "/gate-pass/pending-returnable"],
  "/gate-pass/form": ["/gate-pass/master"],
  "/indent/view": ["/indent/pending", "/indent/approved", "/indent/completed", "/indent/rejected", "/purchase-orders/pending-indent-lines"],
  "/purchase-orders/create": ["/purchase-orders/pending-indent-lines", "/indent/approved"],
  "/orders/form": ["/orders/master", "/orders/pending-ph", "/plant-head"],
  "/billing/pending": ["/billing/master"],
  "/fixed-expenses/daily-form": ["/fixed-expenses/daily-master"],
  "/fixed-expenses/monthly-form": ["/fixed-expenses/monthly-master"],
  "/quality/coa/form": ["/quality/coa/master"],
  "/quality/qc-update/form": ["/quality/qc-update/master"],
  "/quality/pre-dispatch-inspection/form": ["/quality/pre-dispatch-inspection"],
  "/quality/printing-stereo/form": ["/quality/printing-stereo"],
  "/quality/complaints": ["/quality/complaints/master", "/quality/complaints/pending-capa"],
  "/quality/sample-requirement/master/form": ["/quality/sample-requirement/master"],
  "/masters/materials": ["/indent/form", "/material-in/form", "/material-receipt/pending-mrr"],
  // Forms -> page shown after Save
  "/production/pending": ["/production/form"],
  "/production/pending-consumption": ["/material-movement/issue", "/material-movement/reel-issue-return", "/material-movement/reel-issue-return-scan"],
  "/material-movement/pending-non-job-issue": ["/material-movement/issue", "/material-movement/daily-consumption"],
  "/material-movement/reel-issue-return-scan": ["/material-movement/reel-issue-return-scan/form"],
  "/material-receipt/approvals": ["/material-in/form"],
  "/material-receipt/pending-mrr": ["/material-in/form"],
  "/gate-entry/master": ["/gate-entry/form"],
  "/gate-pass/master": ["/gate-pass/form"],
  "/orders/master": ["/orders/form"],
  "/billing/master": ["/billing/pending"],
  "/loading/master": ["/loading/direct"],
  "/purchase-orders/pending-approval": ["/purchase-orders/create"],
  "/quality/coa/master": ["/quality/coa/form"],
  "/quality/printing-stereo": ["/quality/block-record/form", "/quality/printing-stereo/form"],
  "/quality/php-plate/in-out/master": ["/quality/php-plate/in-out/form"],
  "/quality/printing-wastage/master": ["/quality/printing-wastage/form"],
  "/quality/pre-dispatch-inspection": ["/quality/pre-dispatch-inspection/form"],
  "/quality/sample-requirement/master": ["/quality/sample-requirement/master/form"],
  "/quality/spec-card-issue-return": ["/quality/spec-card-issue-return/form"],
  "/quality/special-remarks": ["/quality/special-remarks/form"],
  "/quality/complaints/master": ["/quality/complaints/form"],
};

function isAllowed(user: AuthUser | null, href: string, depth = 0): boolean {
  if (isDirectlyAllowed(user, href)) return true;
  if (!user || depth >= 3) return false;
  return Object.entries(RELATED_PAGE_ACCESS).some(([target, sources]) =>
    (href === target || href.startsWith(`${target}/`)) &&
    sources.some((source) => source !== href && isAllowed(user, source, depth + 1))
  );
}

async function authFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const token = window.localStorage.getItem("authToken") || "";
  const headers = new Headers(init.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [activeFirm, setActiveFirmState] = useState<ActiveFirm | null>(() =>
    normalizeActiveFirm(window.localStorage.getItem(ACTIVE_FIRM_STORAGE_KEY))
  );
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const setActiveFirm = useCallback((firm: ActiveFirm | null) => {
    const normalizedFirm = normalizeActiveFirm(firm);
    setActiveFirmState(normalizedFirm);
    if (normalizedFirm) {
      window.localStorage.setItem(ACTIVE_FIRM_STORAGE_KEY, JSON.stringify(normalizedFirm));
    } else {
      window.localStorage.removeItem(ACTIVE_FIRM_STORAGE_KEY);
    }
    window.dispatchEvent(new CustomEvent("active-firm-changed", { detail: normalizedFirm }));
  }, []);

  const refreshMe = useCallback(async (showLoading = true) => {
    const token = window.localStorage.getItem("authToken") || "";
    if (!token) {
      setUser(null);
      setActiveFirmState(null);
      window.localStorage.removeItem(ACTIVE_FIRM_STORAGE_KEY);
      setAuthError(null);
      if (showLoading) setLoading(false);
      return;
    }
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 10_000);
    try {
      if (showLoading) {
        setLoading(true);
        setAuthError(null);
      }
      const res = await authFetch("/api/auth/me", { signal: controller.signal });
      if (!res.ok) {
        const errorPayload = await res.json().catch(() => ({} as { error?: string; code?: string }));
        if (res.status === 401 || res.status === 403) {
          window.localStorage.removeItem("authToken");
          window.localStorage.removeItem(ACTIVE_FIRM_STORAGE_KEY);
          setUser(null);
          setActiveFirmState(null);
        }
        if (showLoading && res.status !== 401 && res.status !== 403) {
          setAuthError(errorPayload.error || `Authentication check failed (${res.status}).`);
        }
        return;
      }
      const me = (await res.json()) as AuthUser;
      setUser({ ...me, role: normalizeRole(me.role), menuAccess: normalizeMenuAccess(me.menuAccess) });
    } catch (error) {
      if (showLoading) {
        setAuthError((error as Error)?.name === "AbortError"
          ? "The ERP server or database did not respond within 10 seconds. Check /api/health or the server logs."
          : "Unable to verify your session. Check that the ERP server is running and the database is reachable.");
      }
      // Keep the current user during a temporary background connectivity failure.
    } finally {
      window.clearTimeout(timeoutId);
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshMe();
  }, [refreshMe]);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refreshMe(false);
    };
    const intervalId = window.setInterval(refreshWhenVisible, 30_000);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refreshMe]);

  const login = useCallback(async (identifier: string, password: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier, password }),
    });
    if (!res.ok) {
      let msg = "Login failed";
      try {
        const data = await res.json();
        msg = data?.error || msg;
      } catch {
        // ignore
      }
      throw new Error(msg);
    }
    const data = await res.json();
    window.localStorage.setItem("authToken", String(data.token || ""));
    window.localStorage.removeItem(ACTIVE_FIRM_STORAGE_KEY);
    setActiveFirmState(null);
    setAuthError(null);
    const nextUser = {
      ...(data.user as AuthUser),
      role: normalizeRole(data.user?.role),
      menuAccess: normalizeMenuAccess(data.user?.menuAccess),
    };
    setUser(nextUser);
    return nextUser;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authFetch("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore
    } finally {
      window.localStorage.removeItem("authToken");
      window.localStorage.removeItem(ACTIVE_FIRM_STORAGE_KEY);
      setUser(null);
      setActiveFirmState(null);
      setAuthError(null);
    }
  }, []);

  const hasAccess = useCallback((href: string) => isDirectlyAllowed(user, href), [user]);
  const canOpenPage = useCallback((href: string) => isAllowed(user, href), [user]);
  const retryAuth = useCallback(() => { void refreshMe(true); }, [refreshMe]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, activeFirm, activeFirmId: activeFirm?.id || "", loading, authError, retryAuth, login, logout, setActiveFirm, hasAccess, canOpenPage }),
    [user, activeFirm, loading, authError, retryAuth, login, logout, setActiveFirm, hasAccess, canOpenPage]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
