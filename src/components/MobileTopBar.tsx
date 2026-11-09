import { Download, Plus, RefreshCw } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { clearMobilePageHeader, readMobilePageHeader } from "../lib/mobilePageHeader";
import { MOBILE_QUERY } from "../lib/mobileCompactLayout";

type HeaderState = { title: string; addLabel: string; exportKinds: string };

// Reads the current page's title (and single "New …" button) on phones.
export function useMobilePageHeader() {
  const location = useLocation();
  const [state, setState] = useState<HeaderState>({ title: "", addLabel: "", exportKinds: "" });
  const addButtonRef = useRef<HTMLElement | null>(null);
  const exportButtonsRef = useRef<HTMLElement[]>([]);

  useEffect(() => {
    const content = document.querySelector<HTMLElement>(".app-view-content");
    if (!content) return;
    const media = window.matchMedia(MOBILE_QUERY);

    const update = () => {
      if (!media.matches) {
        clearMobilePageHeader(content);
        addButtonRef.current = null;
        exportButtonsRef.current = [];
        setState((current) => (current.title || current.addLabel || current.exportKinds ? { title: "", addLabel: "", exportKinds: "" } : current));
        return;
      }
      const header = readMobilePageHeader(content);
      addButtonRef.current = header.addButton;
      exportButtonsRef.current = header.exports.map((item) => item.button);
      const exportKinds = header.exports.map((item) => item.kind).join(",");
      setState((current) =>
        current.title === header.title && current.addLabel === header.addLabel && current.exportKinds === exportKinds
          ? current
          : { title: header.title, addLabel: header.addLabel, exportKinds },
      );
    };

    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer !== null) return;
      timer = setTimeout(() => {
        timer = null;
        update();
      }, 150);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(content, { childList: true, subtree: true, characterData: true });
    media.addEventListener?.("change", update);
    update();
    return () => {
      observer.disconnect();
      media.removeEventListener?.("change", update);
      if (timer !== null) clearTimeout(timer);
    };
  }, [location.pathname]);

  const pressAdd = () => {
    const button = addButtonRef.current;
    if (button && button.isConnected) button.click();
  };

  const pressExport = (index: number) => {
    const button = exportButtonsRef.current[index];
    if (button && button.isConnected) button.click();
  };

  return { ...state, pressAdd, pressExport };
}

// Phone top bar: one download icon per PDF / Excel button of the page.
export function MobileExportButtons({ kinds, onPress }: { kinds: string; onPress: (index: number) => void }) {
  if (!kinds) return null;
  return (
    <>
      {kinds.split(",").map((kind, index) => (
        <button
          key={`${kind}-${index}`}
          type="button"
          onClick={() => onPress(index)}
          aria-label={kind === "pdf" ? "Download PDF" : kind === "refresh" ? "Refresh" : "Download Excel"}
          title={kind === "pdf" ? "Download PDF" : kind === "refresh" ? "Refresh" : "Download Excel"}
          className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded border-2 md:hidden ${
            kind === "pdf" ? "border-red-600 bg-red-50 text-red-600" : kind === "refresh" ? "border-black bg-white text-black" : "border-emerald-600 bg-emerald-50 text-emerald-700"
          }`}
        >
          {kind === "refresh" ? <RefreshCw size={18} aria-hidden="true" /> : <Download size={18} aria-hidden="true" />}
        </button>
      ))}
    </>
  );
}

// Page name in the phone top bar. Reports whether the name is too long to
// fit beside the full-screen button, so that button can step aside.
export function MobilePageTitle({ title, onTooLong }: { title: string; onTooLong: (tooLong: boolean) => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [tooLong, setTooLong] = useState(false);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      // With the full-screen button hidden the name has about 48 px more, so
      // judge against the width it would have with the button shown; this
      // keeps the decision stable.
      const widthWithButton = element.clientWidth - (tooLong ? 48 : 0);
      const next = Boolean(title) && element.scrollWidth > widthWithButton + 1;
      if (next !== tooLong) {
        setTooLong(next);
        onTooLong(next);
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [title, tooLong, onTooLong]);

  return (
    <div
      ref={ref}
      className="min-w-0 flex-1 truncate text-sm font-black uppercase tracking-tight text-black md:hidden"
      title={title}
    >
      {title}
    </div>
  );
}

export function MobileAddButton({ label, onPress }: { label: string; onPress: () => void }) {
  if (!label) return null;
  return (
    <button
      type="button"
      onClick={onPress}
      aria-label={label}
      title={label}
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded border-2 border-black bg-indigo-600 text-white shadow md:hidden"
    >
      <Plus size={20} aria-hidden="true" />
    </button>
  );
}
