import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "YesChef",
    short_name: "YesChef",
    description: "Personal recipe log: what I've cooked, how it went, and what to cook next.",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f4ee",
    theme_color: "#4b6b4a",
    orientation: "portrait",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png" },
      { src: "/icons/512?maskable=1", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
