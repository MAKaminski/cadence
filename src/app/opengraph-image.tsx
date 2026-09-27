import { ImageResponse } from "next/og";
import { COUNTS } from "@/lib/catalog";
import { SITE } from "@/lib/site";

export const alt = `${SITE.name}: ${SITE.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OG() {
  const bars = [0.26, 0.4, 0.54, 0.68];
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "linear-gradient(180deg,#4338ca,#6d28d9)", color: "white", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 64 }}>
          {bars.map((h) => <div key={h} style={{ width: 14, height: 64 * h / 0.68, borderRadius: 7, background: "white" }} />)}
        </div>
        <div style={{ fontSize: 56, fontWeight: 700, letterSpacing: -1 }}>Cadence</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.1, letterSpacing: -2 }}>LinkedIn posts in your own voice, from two minutes a week.</div>
        <div style={{ fontSize: 30, opacity: 0.85 }}>{`${COUNTS.setup} settings once · ${COUNTS.weekly} weekly actions · ${COUNTS.routines} automatic routines · open source`}</div>
      </div>
    </div>,
    size,
  );
}
