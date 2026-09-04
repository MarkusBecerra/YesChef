import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

const SIZES = new Set([180, 192, 512]);

/** /icons/192, /icons/512, /icons/512?maskable=1 - the app icon as PNG, generated from the same art as icon.svg. */
export async function GET(request: NextRequest, ctx: RouteContext<"/icons/[size]">) {
  const size = Number((await ctx.params).size);
  if (!SIZES.has(size)) return new Response("Not found", { status: 404 });
  const maskable = request.nextUrl.searchParams.has("maskable");
  // Maskable icons get extra padding so the safe zone (inner 80%) holds the whole mark.
  const scale = maskable ? 0.72 : 0.92;
  const mark = size * scale;

  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#4b6b4a",
          borderRadius: maskable ? 0 : size * 0.22,
        }}
      >
        <svg width={mark} height={mark} viewBox="0 0 64 64">
          <circle cx="28" cy="34" r="15" fill="#f5f4ee" />
          <circle cx="28" cy="34" r="10" fill="#262521" />
          <rect x="41" y="31.5" width="16" height="5" rx="2.5" fill="#f5f4ee" />
          <circle cx="24" cy="31" r="2.6" fill="#f5f4ee" />
        </svg>
      </div>
    ),
    { width: size, height: size, headers: { "cache-control": "public, max-age=604800, immutable" } },
  );
}
