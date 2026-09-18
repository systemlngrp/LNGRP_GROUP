import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { AlertCircle, Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { useData } from "../hooks/useData";
import { Firm } from "../types";
import { useAppAutoRefresh, useAutoRefreshStatus, useAutoRefreshPause, useIsAutoRefreshPaused } from "../hooks/useAutoRefresh";
import { ConfirmProvider } from "./ConfirmDialog";
import { getFirmDisplayName } from "../lib/firmDisplay";
import { useRealtimeDataSync } from "../hooks/useRealtimeDataSync";

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [alertQueue, setAlertQueue] = useState<string[]>([]);
  const location = useLocation();
  const { user, activeFirm, setActiveFirm, hasAccess, logout } = useAuth();
  const [firms] = useData<Firm>("firms", [], { firmScope: "all" });
  const isFormRoute =
    /\/form(\/|$)/.test(location.pathname) ||
    /\/create(\/|$)/.test(location.pathname);

  useAutoRefreshPause(isFormRoute);
  useAppAutoRefresh(Boolean(user));
  useRealtimeDataSync(Boolean(user));
  const autoRefreshStatus = useAutoRefreshStatus(Boolean(user));
  const isAutoRefreshPaused = useIsAutoRefreshPaused(Boolean(user));

  useEffect(() => {
    const saved = window.localStorage.getItem("layout-sidebar-collapsed");
    setSidebarCollapsed(saved === "true");
  }, []);

  useEffect(() => {
    const nativeAlert = window.alert;
    window.alert = (message?: unknown) => {
      const text = String(message ?? "");
      setAlertQueue((previous) => [...previous, text]);
    };

    return () => {
      window.alert = nativeAlert;
    };
  }, []);

  const currentAlert = alertQueue[0];

  useEffect(() => {
    if (currentAlert === undefined) return;
    const timeoutId = window.setTimeout(() => {
      setAlertQueue((previous) => previous.slice(1));
    }, 7000);
    return () => window.clearTimeout(timeoutId);
  }, [currentAlert]);

  const dismissAlert = () => {
    setAlertQueue((previous) => previous.slice(1));
  };

  useEffect(() => {
    if (!user || activeFirm || firms.length === 0) return;
    const firstFirm = firms.slice().sort((a, b) => getFirmDisplayName(a).localeCompare(getFirmDisplayName(b)))[0];
    setActiveFirm(firstFirm);
  }, [activeFirm, firms, setActiveFirm, user]);

  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem("layout-sidebar-collapsed", String(next));
      return next;
    });
  };

  if (user && !hasAccess(location.pathname)) {
    return <Navigate to="/unauthorized" replace />;
  }

  const avatar = (user?.name || user?.userId || "U").trim().slice(0, 1).toUpperCase();
  const lastRefreshLabel = autoRefreshStatus.at
    ? new Date(autoRefreshStatus.at).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "Not yet";
  const lastRefreshReasonLabel = autoRefreshStatus.reason
    ? autoRefreshStatus.reason === "visibility"
      ? "Tab Return"
      : autoRefreshStatus.reason === "focus"
        ? "Focus"
        : "Idle"
    : null;
  const refreshStatusLabel = isAutoRefreshPaused
    ? "Paused"
    : lastRefreshReasonLabel
      ? `Last Refresh (${lastRefreshReasonLabel})`
      : "Last Refresh";
  const refreshValueLabel = isAutoRefreshPaused
    ? "Editing in progress"
    : lastRefreshLabel;

  return (
    <ConfirmProvider>
    <div className="flex h-screen w-full bg-slate-50 font-sans">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        isCollapsed={sidebarCollapsed}
      />
      
      {sidebarOpen && (
        <div 
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            onClick={() => setSidebarOpen(false)}
        />
      )}

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {currentAlert !== undefined ? (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/10 px-4" role="presentation">
            <div
              role="alert"
              aria-live="assertive"
              className="relative w-full max-w-lg rounded-lg border-2 border-indigo-600 bg-white p-6 text-black shadow-2xl"
            >
              <button
                type="button"
                onClick={dismissAlert}
                aria-label="Close message"
                className="absolute right-3 top-3 rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-black"
              >
                <X size={18} />
              </button>
              <div className="flex items-start gap-3 pr-7">
                <AlertCircle className="mt-0.5 shrink-0 text-indigo-600" size={22} />
                <p className="whitespace-pre-wrap break-words text-sm font-semibold leading-6">{currentAlert}</p>
              </div>
            </div>
          </div>
        ) : null}
        <header className="bg-white shadow-sm relative z-10 border-b border-black">
          <div className="w-full px-3 py-3 sm:px-4 lg:px-5">
             <div className="flex min-h-8 flex-wrap items-center justify-between gap-2">
               <div className="flex items-center gap-4">
                 <button 
                    className="md:hidden p-2 -ml-2 text-black"
                    onClick={() => setSidebarOpen(true)}
                 >
                    <Menu size={20} />
                 </button>
                 <button
                    className="hidden md:inline-flex items-center justify-center rounded border border-black bg-white p-2 text-black hover:bg-slate-100 transition"
                    onClick={toggleSidebarCollapsed}
                    title={sidebarCollapsed ? "Expand menu" : "Collapse menu"}
                 >
                    {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
                 </button>
               </div>
               <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 sm:gap-4">
                  {user && (
                    <div className="hidden lg:flex flex-col items-end leading-tight rounded border border-slate-300 bg-slate-50 px-3 py-1">
                      <div className="text-[10px] font-black uppercase text-slate-500">
                        {refreshStatusLabel}
                      </div>
                      <div className="text-[11px] font-bold text-black">{refreshValueLabel}</div>
                    </div>
                  )}
                  {user && (
                    <div className="hidden sm:flex flex-col items-end leading-tight">
                      <div className="text-[11px] font-black text-black">{user.name}</div>
                      <div className="text-[10px] font-bold text-slate-600">{user.role}</div>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => logout()}
                    className="hidden sm:inline-flex items-center rounded border border-black bg-red-600 px-3 py-1.5 text-[11px] font-black text-white hover:bg-red-700 transition"
                    title="Logout"
                  >
                    Logout
                  </button>
                  <div className="h-8 w-8 rounded-full bg-black flex items-center justify-center text-white font-bold border border-black">
                    {avatar}
                  </div>
               </div>
             </div>
          </div>
        </header>
        <div className="app-view-content flex-1 overflow-auto bg-white">
          <div className="w-full min-w-0 py-4 px-2 sm:px-3 lg:px-4">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
    </ConfirmProvider>
  );
}
