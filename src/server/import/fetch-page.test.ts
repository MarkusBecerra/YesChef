import { afterEach, describe, expect, it, vi } from "vitest";
import { assertPublicHttpUrl, fetchHtml, ImportError } from "./fetch-page";

describe("assertPublicHttpUrl", () => {
  it("accepts ordinary public links", () => {
    expect(assertPublicHttpUrl("https://www.example.com/recipes/1?x=1").hostname).toBe("www.example.com");
    expect(assertPublicHttpUrl("http://blog.example.co.uk/post").protocol).toBe("http:");
  });

  it("rejects non-http schemes, IP literals, and internal names", () => {
    for (const bad of [
      "not a url",
      "ftp://example.com/x",
      "file:///etc/passwd",
      "http://127.0.0.1:3000/",
      "http://10.0.0.5/",
      "http://[::1]/",
      "http://localhost/",
      "http://db.internal/",
      "http://intranet/",
      "http://printer.local/",
    ]) {
      expect(() => assertPublicHttpUrl(bad), bad).toThrow(ImportError);
    }
  });
});

describe("fetchHtml", () => {
  afterEach(() => vi.unstubAllGlobals());

  const refuse = (status: number, headers: Record<string, string> = {}) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Just a moment...", { status, headers })));
    return vi.spyOn(console, "warn").mockImplementation(() => {});
  };

  it("points a blocked cook at Paste text instead of at a status code", async () => {
    const warn = refuse(403, { "cf-mitigated": "challenge" });
    await expect(fetchHtml("https://www.example.com/recipe")).rejects.toThrow(/Paste text/);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("cf-mitigated: challenge"));
  });

  it("treats a bare 403, 429 or 503 as a wall too", async () => {
    for (const status of [403, 429, 503]) {
      refuse(status);
      await expect(fetchHtml("https://www.example.com/recipe"), String(status)).rejects.toThrow(/blocks automated readers/);
    }
  });

  it("still reports an ordinary server error as itself", async () => {
    refuse(500);
    await expect(fetchHtml("https://www.example.com/recipe")).rejects.toThrow("The site answered with HTTP 500");
  });
});
