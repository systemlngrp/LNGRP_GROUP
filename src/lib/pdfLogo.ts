import type { Setting } from "../types";

export function getOrganizationLogoUrl(setting?: Setting | null) {
  const fileName = String(setting?.organizationLogo || "").trim();
  if (!fileName) return "";
  const encoded = fileName.split("/").map(encodeURIComponent).join("/");
  if (typeof window === "undefined") return `/uploads/${encoded}`;
  return new URL(`/uploads/${encoded}`, window.location.origin).toString();
}

export async function loadPdfLogo(setting?: Setting | null) {
  const logoUrl = getOrganizationLogoUrl(setting);
  if (!logoUrl) return "";

  const response = await fetch(logoUrl);
  if (!response.ok) throw new Error("Failed to load logo image.");
  const blob = await response.blob();
  const sourceUrl = URL.createObjectURL(blob);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Failed to decode logo image."));
      element.src = sourceUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;
    if (!canvas.width || !canvas.height) throw new Error("Logo image has no dimensions.");

    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable for logo normalization.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}
