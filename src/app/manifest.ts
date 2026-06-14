import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DomicileDB",
    short_name: "DomicileDB",
    description:
      "Self-hosted home inventory — prove what you owned and get paid after a disaster.",
    start_url: "/",
    display: "standalone",
    background_color: "#fafafa",
    theme_color: "#16a34a",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
