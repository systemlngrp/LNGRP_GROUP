import { lazy, type ComponentType, type LazyExoticComponent } from "react";

type LazyModule<T extends ComponentType<any>> = { default: T };

function isDynamicImportError(error: unknown) {
  const message = String((error as Error)?.message || error || "").toLowerCase();
  return message.includes("failed to fetch dynamically imported module")
    || message.includes("loading chunk")
    || message.includes("importing a module script failed");
}

export function lazyWithRetry<T extends ComponentType<any>>(
  importer: () => Promise<LazyModule<T>>,
  key: string
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      const module = await importer();
      window.sessionStorage.removeItem(`erp:chunk-reload:${key}`);
      return module;
    } catch (error) {
      if (!isDynamicImportError(error)) throw error;

      const reloadKey = `erp:chunk-reload:${key}`;
      if (window.sessionStorage.getItem(reloadKey) !== "1") {
        window.sessionStorage.setItem(reloadKey, "1");
        window.location.reload();
        return new Promise<LazyModule<T>>(() => undefined);
      }

      throw error;
    }
  });
}
