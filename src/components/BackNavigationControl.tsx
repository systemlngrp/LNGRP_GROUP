import { ArrowLeft } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

export const APP_BACK_FALLBACK = "/operations-dashboard";

export function hasPreviousAppHistory(state: unknown) {
  const index = Number((state as { idx?: unknown } | null)?.idx);
  return Number.isFinite(index) && index > 0;
}

export function BackNavigationControl() {
  const navigate = useNavigate();
  const location = useLocation();
  const canGoBack = hasPreviousAppHistory(window.history.state);

  const goBack = () => {
    if (hasPreviousAppHistory(window.history.state)) {
      navigate(-1);
      return;
    }
    if (location.pathname !== APP_BACK_FALLBACK) {
      navigate(APP_BACK_FALLBACK, { replace: true });
    }
  };

  return (
    <button
      type="button"
      onClick={goBack}
      disabled={!canGoBack && location.pathname === APP_BACK_FALLBACK}
      aria-label="Go back"
      title="Back"
      className="fixed bottom-4 right-4 z-[90] inline-flex items-center gap-2 rounded border-2 border-black bg-white px-4 py-2 text-sm font-bold text-black shadow-lg transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-slate-300"
    >
      <ArrowLeft size={16} aria-hidden="true" />
      Back
    </button>
  );
}
