import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { clearFilterPanels, enhanceMobileLayout, MOBILE_QUERY, OWN_CLASS } from "../lib/mobileCompactLayout";

export function MobileCompactLayout() {
  const location = useLocation();

  useEffect(() => {
    const content = document.querySelector<HTMLElement>(".app-view-content");
    if (!content) return;
    const media = window.matchMedia(MOBILE_QUERY);

    const enhance = () => {
      if (!media.matches) {
        clearFilterPanels(content);
        return;
      }
      enhanceMobileLayout(content);
    };

    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer !== null) return;
      timer = setTimeout(() => {
        timer = null;
        enhance();
      }, 200);
    };
    const isOwn = (node: Node) => {
      const element = node instanceof Element ? node : node.parentElement;
      return Boolean(element?.closest(`.${OWN_CLASS}`));
    };
    const observer = new MutationObserver((records) => {
      if (records.every((record) => isOwn(record.target) || [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)].every(isOwn) && record.addedNodes.length + record.removedNodes.length > 0)) return;
      schedule();
    });
    observer.observe(content, { childList: true, subtree: true });
    // Typing in a filter or picking a date does not change the page's
    // elements, so refresh the "(n active)" count on input too.
    content.addEventListener("input", schedule, true);
    content.addEventListener("change", schedule, true);
    // Toggle-button filters change only classes, so refresh on clicks too —
    // but only clicks inside a filter box (a rescan reads the page layout,
    // which is slow next to a big table).
    const onClick = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("[data-mobile-filters], [data-mf-panel], [data-mf-fold]")) schedule();
    };
    content.addEventListener("click", onClick, true);
    media.addEventListener?.("change", enhance);
    enhance();
    return () => {
      observer.disconnect();
      content.removeEventListener("input", schedule, true);
      content.removeEventListener("change", schedule, true);
      content.removeEventListener("click", onClick, true);
      media.removeEventListener?.("change", enhance);
      if (timer !== null) clearTimeout(timer);
    };
  }, [location.pathname]);

  return null;
}
