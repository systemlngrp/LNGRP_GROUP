import React, { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, RotateCcw, Upload } from "lucide-react";
import { formatBytes, optimizeImageForUpload } from "../lib/imageOptimize";

type Props = {
  label: string;
  required?: boolean;
  /** Saved file name (or URL) of the photo, "" when none. */
  value: string;
  onChange: (filename: string) => void;
  /** Tells the form a photo is uploading, so it can hold Save. */
  onUploadingChange?: (uploading: boolean) => void;
  disabled?: boolean;
  className?: string;
};

const photoUrl = (value: string) => (/^https?:\/\//i.test(value) || value.startsWith("/uploads/") ? value : `/uploads/${value.replace(/^\/?uploads\//i, "")}`);

/**
 * Photo field with visible progress: optimises the photo on the device, shows
 * "Optimising / Uploading…", then a thumbnail with ✓ Uploaded (tap to open),
 * or a red error with Retry.
 */
export function PhotoUploadField({ label, required, value, onChange, onUploadingChange, disabled, className = "" }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [stage, setStage] = useState<"idle" | "optimising" | "uploading" | "error">("idle");
  const [error, setError] = useState("");
  const [sizeNote, setSizeNote] = useState("");
  const [localPreview, setLocalPreview] = useState("");
  const lastFileRef = useRef<File | null>(null);
  const busy = stage === "optimising" || stage === "uploading";

  useEffect(() => { onUploadingChange?.(busy); }, [busy, onUploadingChange]);
  useEffect(() => () => { if (localPreview) URL.revokeObjectURL(localPreview); }, [localPreview]);

  const uploadFile = async (file: File) => {
    lastFileRef.current = file;
    setError("");
    setSizeNote("");
    setLocalPreview((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(file); });
    try {
      setStage("optimising");
      const optimized = await optimizeImageForUpload(file);
      setStage("uploading");
      const response = await fetch("/api/upload-artwork", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: optimized.filename, base64: optimized.dataUrl }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.filename) throw new Error(result.error || `Upload failed (${response.status}).`);
      onChange(String(result.filename));
      setSizeNote(optimized.optimized ? `${formatBytes(optimized.originalBytes)} → ${formatBytes(optimized.bytes)}` : formatBytes(optimized.bytes));
      setStage("idle");
    } catch (uploadError) {
      setError(uploadError instanceof Error && uploadError.message ? uploadError.message : "Photo upload failed. Check the internet and retry.");
      setStage("error");
    }
  };

  const shownImage = value ? photoUrl(value) : "";

  return (
    <div className={`flex h-full flex-col gap-1 ${className}`}>
      <b>{label}{required ? " *" : ""}</b>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        disabled={disabled || busy}
        onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void uploadFile(file); }}
      />
      <div className={`flex min-h-[76px] items-center gap-3 rounded border-2 p-2 ${stage === "error" ? "border-red-600 bg-red-50" : value && !busy ? "border-emerald-600 bg-emerald-50" : "border-black bg-white"}`}>
        {busy ? (
          <>
            {localPreview ? <img src={localPreview} alt="" className="h-14 w-14 shrink-0 rounded border border-slate-300 object-cover opacity-60" /> : null}
            <div className="flex min-w-0 items-center gap-2 text-sm font-bold text-indigo-700">
              <Loader2 size={18} className="shrink-0 animate-spin" />
              {stage === "optimising" ? "Optimising photo…" : "Uploading photo…"}
            </div>
          </>
        ) : value ? (
          <>
            <a href={shownImage} target="_blank" rel="noopener noreferrer" title="Open photo">
              <img src={shownImage} alt={label} className="h-14 w-14 shrink-0 rounded border border-slate-300 object-cover" />
            </a>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1 text-sm font-black text-emerald-700"><CheckCircle2 size={16} /> Uploaded</div>
              {sizeNote ? <div className="text-[11px] font-semibold text-slate-600">{sizeNote}</div> : null}
            </div>
            <button type="button" disabled={disabled} onClick={() => inputRef.current?.click()} className="shrink-0 rounded border-2 border-black bg-white px-3 py-1.5 text-xs font-bold hover:bg-slate-100 disabled:opacity-50">Change</button>
          </>
        ) : stage === "error" ? (
          <>
            <div className="min-w-0 flex-1 text-sm font-bold text-red-700">{error}</div>
            <button type="button" disabled={disabled} onClick={() => lastFileRef.current ? void uploadFile(lastFileRef.current) : inputRef.current?.click()} className="inline-flex shrink-0 items-center gap-1 rounded bg-red-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"><RotateCcw size={14} /> Retry</button>
            <button type="button" disabled={disabled} onClick={() => inputRef.current?.click()} className="shrink-0 rounded border-2 border-black bg-white px-3 py-1.5 text-xs font-bold disabled:opacity-50">Choose</button>
          </>
        ) : (
          <button type="button" disabled={disabled} onClick={() => inputRef.current?.click()} className="inline-flex w-full items-center justify-center gap-2 rounded border-2 border-dashed border-slate-400 bg-slate-50 px-3 py-4 text-sm font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50">
            <Upload size={18} /> Take / choose photo
          </button>
        )}
      </div>
    </div>
  );
}
