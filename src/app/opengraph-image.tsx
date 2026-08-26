import { ImageResponse } from "next/og";
import { BrandMark, brand } from "@/lib/brand";
import { loadOutfit } from "@/lib/og-font";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";

export const alt = `${SITE_NAME}, ${SITE_TAGLINE.toLowerCase()}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const NOTES = [
  "No sign-up",
  "Stays in your browser",
  "Peer-to-peer over WebRTC",
];

export default async function OpengraphImage() {
  const fonts = await loadOutfit([400, 600]);

  return new ImageResponse(
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        alignItems: "center",
        justifyContent: "center",
        background: brand.paper,
        fontFamily: "Outfit",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: 1000,
          padding: 76,
          borderRadius: 40,
          border: `1px solid ${brand.line}`,
          background: brand.panel,
          boxShadow: "0 46px 100px -56px rgba(28, 27, 25, 0.5)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <BrandMark size={96} />
          <div style={{ display: "flex", alignItems: "baseline", gap: 18 }}>
            <div
              style={{
                fontSize: 88,
                fontWeight: 600,
                letterSpacing: -2,
                color: brand.ink,
              }}
            >
              {SITE_NAME}
            </div>
            <div
              style={{ fontSize: 20, letterSpacing: 3, color: brand.inkFaint }}
            >
              OPEN SOURCE
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: 40,
            maxWidth: 800,
            fontSize: 38,
            lineHeight: 1.4,
            color: brand.inkMuted,
          }}
        >
          {`${SITE_TAGLINE}. Send a link and you are drawing on the same board, live.`}
        </div>

        <div style={{ display: "flex", gap: 14, marginTop: 46 }}>
          {NOTES.map((note) => (
            <div
              key={note}
              style={{
                display: "flex",
                padding: "14px 24px",
                borderRadius: 999,
                border: `1px solid ${brand.lineStrong}`,
                background: brand.field,
                fontSize: 24,
                color: brand.inkSoft,
              }}
            >
              {note}
            </div>
          ))}
        </div>
      </div>
    </div>,
    { ...size, fonts },
  );
}
