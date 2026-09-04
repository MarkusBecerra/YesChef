import { describe, expect, it } from "vitest";
import { assertPublicHttpUrl, ImportError } from "./fetch-page";

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
