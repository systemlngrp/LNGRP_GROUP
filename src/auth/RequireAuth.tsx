import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Spinner } from "../components/Spinner";
import { useAuth } from "./AuthContext";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading, authError, retryAuth } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 p-6 text-center">
        <Spinner />
        <div className="text-sm font-bold text-slate-700">Loading LNGRP ERP…</div>
      </div>
    );
  }

  if (authError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 p-6 text-center">
        <div className="max-w-md rounded border-2 border-black bg-white p-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
          <h1 className="text-lg font-black uppercase">Unable to start ERP</h1>
          <p className="mt-2 text-sm font-medium text-slate-700">{authError}</p>
          <button type="button" onClick={retryAuth} className="mt-5 rounded border-2 border-black bg-indigo-600 px-5 py-2 text-sm font-black text-white hover:bg-indigo-700">Retry</button>
        </div>
      </div>
    );
  }

  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search + location.hash);
    return <Navigate to={`/login?next=${next}`} replace />;
  }


  return <>{children}</>;
}

