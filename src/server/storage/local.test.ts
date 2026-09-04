import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLocalStorage, localFileName } from "./local";
import { contentTypeFor, extensionFor } from "./types";

describe("local photo storage", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "yeschef-uploads-"));
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it("stores and deletes files under random names", async () => {
    const storage = createLocalStorage(dir);
    const { url } = await storage.put({ bytes: new Uint8Array([1, 2, 3]), contentType: "image/png", extension: "png" });
    expect(url).toMatch(/^\/api\/v1\/uploads\/[a-f0-9-]{36}\.png$/);
    const name = localFileName(url)!;
    expect(Array.from(await readFile(path.join(dir, name)))).toEqual([1, 2, 3]);

    await storage.delete(url);
    await expect(stat(path.join(dir, name))).rejects.toThrow();
    await expect(storage.delete(url)).resolves.toBeUndefined(); // idempotent
    await expect(storage.delete("https://elsewhere.example/x.png")).resolves.toBeUndefined();
  });

  it("refuses path-like names", () => {
    expect(localFileName("/api/v1/uploads/../../etc/passwd")).toBeNull();
    expect(localFileName("/api/v1/uploads/not-a-uuid.png")).toBeNull();
    expect(localFileName("/api/v1/uploads/123e4567-e89b-12d3-a456-426614174000.jpg")).toBe(
      "123e4567-e89b-12d3-a456-426614174000.jpg",
    );
  });

  it("maps content types to extensions and back", () => {
    expect(extensionFor("image/jpeg")).toBe("jpg");
    expect(extensionFor("image/png; charset=binary")).toBe("png");
    expect(extensionFor("text/html")).toBeNull();
    expect(contentTypeFor("webp")).toBe("image/webp");
    expect(contentTypeFor("exe")).toBeNull();
  });
});
