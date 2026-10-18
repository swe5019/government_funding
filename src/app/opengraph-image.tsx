import { ImageResponse } from "next/og";
import { siteConfig } from "@/config/site";

export const alt = `${siteConfig.name}: ${siteConfig.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Default social card for every page without its own. */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "#0d1117",
          color: "#e6e8eb",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ fontSize: 40, fontWeight: 700, color: "#5b9bf0" }}>{siteConfig.name}</div>
        <div style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.1, maxWidth: 980 }}>{siteConfig.tagline}</div>
        <div style={{ fontSize: 26, color: "#9aa4b2" }}>
          Federal contracts, grants and program awards linked to public companies · Official government sources
        </div>
      </div>
    ),
    size,
  );
}
