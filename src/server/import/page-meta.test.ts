import * as cheerio from "cheerio";
import { describe, expect, it } from "vitest";
import { extractPageMeta, extractReadableText } from "./page-meta";

describe("page metadata and text", () => {
  it("reads Open Graph metadata with relative image URLs resolved", () => {
    const $ = cheerio.load(`<head><title>Fallback</title>
      <meta property="og:title" content="Grandma's Pie">
      <meta property="og:description" content=" Flaky. ">
      <meta property="og:image" content="/img/pie.jpg">
      <meta property="og:site_name" content="Pie Blog"></head>`);
    expect(extractPageMeta($, "https://pie.example/posts/1")).toEqual({
      title: "Grandma's Pie",
      description: "Flaky.",
      imageUrl: "https://pie.example/img/pie.jpg",
      siteName: "Pie Blog",
    });
  });

  it("falls back to <title> and returns nulls when nothing is there", () => {
    expect(extractPageMeta(cheerio.load("<head><title> Just a title </title></head>"), "https://x.example")).toEqual({
      title: "Just a title",
      description: null,
      imageUrl: null,
      siteName: null,
    });
  });

  it("strips chrome and keeps one line per block", () => {
    const $ = cheerio.load(`<body><nav>Home Links</nav><script>var x=1</script>
      <article><h1>Soup</h1><p>Intro text.</p><ul><li>1 onion</li><li>2 carrots</li></ul>
      <p>Step one.<br>Step two.</p></article><footer>copyright</footer></body>`);
    const text = extractReadableText($);
    expect(text).toContain("Soup\n");
    expect(text).toContain("1 onion\n2 carrots");
    expect(text).toContain("Step one.\nStep two.");
    expect(text).not.toContain("Home Links");
    expect(text).not.toContain("var x");
    expect(text).not.toContain("copyright");
  });

  it("windows very long pages around the ingredients heading", () => {
    const filler = "story ".repeat(12000); // ~72k chars of preamble
    const $ = cheerio.load(`<body><p>${filler}</p><h2>Ingredients</h2><p>3 eggs</p><h2>Method</h2><p>Whisk.</p></body>`);
    const text = extractReadableText($);
    expect(text.length).toBeLessThanOrEqual(40_000);
    expect(text).toContain("Ingredients");
    expect(text).toContain("3 eggs");
    expect(text).toContain("Whisk.");
  });
});
