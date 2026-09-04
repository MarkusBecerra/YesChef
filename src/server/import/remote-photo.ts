import { extensionFor, getPhotoStorage, MAX_PHOTO_BYTES } from "@/server/storage";
import { assertPublicHttpUrl, BROWSER_HEADERS } from "./fetch-page";

/** Download an image the source page advertised and store it like an upload. Returns null on any failure. */
export async function storePhotoFromUrl(rawUrl: string): Promise<string | null> {
  try {
    const url = assertPublicHttpUrl(rawUrl);
    const res = await fetch(url, { headers: { ...BROWSER_HEADERS, accept: "image/*" }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim();
    const extension = extensionFor(contentType);
    if (!extension) return null;
    const length = Number(res.headers.get("content-length") ?? 0);
    if (length > MAX_PHOTO_BYTES) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_PHOTO_BYTES) return null;
    const { url: stored } = await getPhotoStorage().put({ bytes, contentType, extension });
    return stored;
  } catch (err) {
    console.warn("Could not copy remote photo", rawUrl, err);
    return null;
  }
}
