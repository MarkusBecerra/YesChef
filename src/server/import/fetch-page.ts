const MAX_HTML_BYTES = 3 * 1024 * 1024;
const TIMEOUT_MS = 15_000;

/** A desktop browser UA: many recipe sites serve stripped-down or blocked pages to unknown clients. */
export const BROWSER_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
};

export class ImportError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

/** Only public http(s) hosts: no IP literals, no localhost, no internal names. */
export function assertPublicHttpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ImportError("That doesn't look like a valid link");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new ImportError("Only http(s) links can be imported");
  const host = url.hostname.toLowerCase();
  const isIp = /^[\d.]+$/.test(host) || host.includes(":") || host.startsWith("[");
  if (isIp || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || !host.includes(".")) {
    throw new ImportError("That address can't be imported");
  }
  return url;
}

export async function fetchHtml(raw: string): Promise<{ html: string; finalUrl: string }> {
  const url = assertPublicHttpUrl(raw);
  let res: Response;
  try {
    res = await fetch(url, { headers: BROWSER_HEADERS, redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    throw new ImportError(err instanceof Error && err.name === "TimeoutError" ? "The site took too long to respond" : "Couldn't reach that site", 502);
  }
  assertPublicHttpUrl(res.url || url.href);
  if (!res.ok) throw new ImportError(`The site answered with HTTP ${res.status}`, 502);
  const type = res.headers.get("content-type") ?? "";
  if (!/text\/html|application\/xhtml\+xml/i.test(type)) throw new ImportError("That link isn't a web page", 415);

  const reader = res.body?.getReader();
  if (!reader) throw new ImportError("Empty response from the site", 502);
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    chunks.push(value);
    if (received > MAX_HTML_BYTES) {
      reader.cancel().catch(() => {});
      break;
    }
  }
  const html = new TextDecoder("utf-8").decode(Buffer.concat(chunks));
  return { html, finalUrl: res.url || url.href };
}
