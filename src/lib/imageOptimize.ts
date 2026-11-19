// Shrinks a photo in the browser before it is uploaded: longest side at most
// `maxSide` px, saved as JPEG. A 3-8 MB phone photo becomes roughly 200-400 KB,
// which uploads in a couple of seconds on mobile data. Phone orientation (EXIF)
// is applied, so the photo is never sideways. Anything that is not an image, or
// that the browser cannot decode, is sent as it is.

export type OptimizedImage = { dataUrl: string; filename: string; bytes: number; originalBytes: number; optimized: boolean };

const readAsDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read the photo."));
    reader.readAsDataURL(blob);
  });

const loadBitmap = async (file: File): Promise<ImageBitmap | HTMLImageElement> => {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
    } catch {
      /* fall back to <img> below */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return image;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
};

export async function optimizeImageForUpload(file: File, maxSide = 1600, quality = 0.8): Promise<OptimizedImage> {
  const original = async (): Promise<OptimizedImage> => ({ dataUrl: await readAsDataUrl(file), filename: file.name || "photo", bytes: file.size, originalBytes: file.size, optimized: false });
  if (!file.type.startsWith("image/") || file.type === "image/gif" || file.type === "image/svg+xml") return original();
  try {
    const source = await loadBitmap(file);
    const width = "naturalWidth" in source ? source.naturalWidth : source.width;
    const height = "naturalHeight" in source ? source.naturalHeight : source.height;
    if (!width || !height) return original();
    const scale = Math.min(1, maxSide / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) return original();
    context.fillStyle = "#ffffff"; // transparent PNGs get a white background in JPEG
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(source as CanvasImageSource, 0, 0, canvas.width, canvas.height);
    if ("close" in source && typeof source.close === "function") source.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob || blob.size >= file.size) return original(); // already small: keep the original
    const baseName = (file.name || "photo").replace(/\.[^.]+$/, "") || "photo";
    return { dataUrl: await readAsDataUrl(blob), filename: `${baseName}.jpg`, bytes: blob.size, originalBytes: file.size, optimized: true };
  } catch {
    return original();
  }
}

export const formatBytes = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
