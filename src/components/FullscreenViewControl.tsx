import { Maximize2, Minimize2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

function isFullscreenEligible(pathname: string) {
  const path = pathname.toLowerCase();
  return path.includes("/master") || path.includes("/masters") || path.startsWith("/reports/") || path === "/quality/qc-view" || path.startsWith("/quality/qc-");
}

export function FullscreenViewControl() {
  const location = useLocation();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const eligible = isFullscreenEligible(location.pathname);

  useEffect(() => {
    const content = document.querySelector<HTMLElement>(".app-view-content");
    if (!content) return;

    const syncState = () => setIsFullscreen(document.fullscreenElement === content);
    const handleFullscreenError = () => setIsFullscreen(false);
    document.addEventListener("fullscreenchange", syncState);
    document.addEventListener("fullscreenerror", handleFullscreenError);
    syncState();

    if (!eligible && document.fullscreenElement === content) {
      void document.exitFullscreen().catch(() => setIsFullscreen(false));
    }

    return () => {
      document.removeEventListener("fullscreenchange", syncState);
      document.removeEventListener("fullscreenerror", handleFullscreenError);
    };
  }, [eligible, location.pathname]);

  if (!eligible) return null;

  const toggleFullscreen = async () => {
    const content = document.querySelector<HTMLElement>(".app-view-content");
    if (!content || !document.fullscreenEnabled) return;

    try {
      if (document.fullscreenElement === content) {
        await document.exitFullscreen();
      } else {
        await content.requestFullscreen();
      }
    } catch {
      setIsFullscreen(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void toggleFullscreen()}
      className="app-fullscreen-control inline-flex h-10 w-10 items-center justify-center rounded border-2 border-black bg-indigo-700 text-white shadow-lg transition hover:bg-indigo-800 focus:outline-none focus:ring-2 focus:ring-indigo-300"
      aria-label={isFullscreen ? "Exit full screen" : "Enter full screen"}
      title={isFullscreen ? "Exit Full Screen" : "Full Screen"}
    >
      {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
    </button>
  );
}
