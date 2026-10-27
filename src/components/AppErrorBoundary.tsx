import React from "react";

type State = { error: Error | null };

export class AppErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ERP application startup error:", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-center">
        <div className="max-w-lg rounded border-2 border-black bg-white p-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
          <h1 className="text-lg font-black uppercase">ERP could not load</h1>
          <p className="mt-2 text-sm font-medium text-slate-700">{this.state.error.message || "An unexpected application error occurred."}</p>
          <button type="button" onClick={() => window.location.reload()} className="mt-5 rounded border-2 border-black bg-indigo-600 px-5 py-2 text-sm font-black text-white hover:bg-indigo-700">Reload application</button>
        </div>
      </div>
    );
  }
}
