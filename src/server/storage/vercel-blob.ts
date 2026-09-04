import { del, put } from "@vercel/blob";
import type { PhotoStorage } from "./types";

/** Production storage on Vercel Blob. Needs BLOB_READ_WRITE_TOKEN. URLs are public but unguessable. */
export function createVercelBlobStorage(): PhotoStorage {
  return {
    async put({ bytes, contentType, extension }) {
      const result = await put(`recipes/${crypto.randomUUID()}.${extension}`, Buffer.from(bytes), {
        access: "public",
        contentType,
        addRandomSuffix: false,
      });
      return { url: result.url };
    },
    async delete(url) {
      if (!/^https:\/\/[^/]+\.blob\.vercel-storage\.com\//.test(url)) return;
      try {
        await del(url);
      } catch (err) {
        console.warn("Could not delete blob", url, err);
      }
    },
  };
}
