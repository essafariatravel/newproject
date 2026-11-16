import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "ESSAFARIA VISA OS",
    short_name: "VISA OS",
    description: "ESSAFARIA TRAVEL — espace professionnel des visas",
    start_url: "/login",
    scope: "/",
    display: "standalone",
    background_color: "#f8f7f3",
    theme_color: "#0d1c33",
    icons: [
      { src: "/images/essafaria-logo.png", sizes: "any", type: "image/png" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
