"use client";

/**
 * Shrink a photo in the browser before upload: phone cameras produce 4–12 MB
 * files, and we only need something that looks good on a phone-sized card.
 * Falls back to the original file if the browser can't decode it.
 */
export async function compressImage(
  file: File,
  { maxSize = 1600, quality = 0.82 }: { maxSize?: number; quality?: number } = {},
): Promise<{ blob: Blob; contentType: string }> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob) throw new Error("toBlob failed");
    // Only use the re-encoded version if it actually helped.
    if (blob.size < file.size || scale < 1) return { blob, contentType: "image/jpeg" };
    return { blob: file, contentType: file.type };
  } catch {
    return { blob: file, contentType: file.type || "image/jpeg" };
  }
}
