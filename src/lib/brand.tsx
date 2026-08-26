/**
 * Palette and logo mark for the generated icons and social images. Satori reads
 * neither the CSS variables nor the oklch() values in globals.css, so the
 * tokens the marks need are repeated here as plain hex.
 */
export const brand = {
  ink: "#1c1b19",
  inkSoft: "#4a4844",
  inkMuted: "#6f6d67",
  inkFaint: "#8a8880",
  paper: "#f4f1ea",
  panel: "#fffefb",
  field: "#faf8f3",
  accent: "#0088f2",
  line: "rgba(28, 27, 25, 0.1)",
  lineStrong: "rgba(28, 27, 25, 0.14)",
};

type BrandMarkProps = {
  size: number;
  radius?: number;
};

export function BrandMark({ size, radius = size * 0.28 }: BrandMarkProps) {
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        width: size,
        height: size,
        borderRadius: radius,
        background: brand.ink,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: size * 0.17,
          top: size * 0.6,
          width: size * 0.56,
          height: Math.max(3, size * 0.1),
          borderRadius: size,
          background: brand.paper,
          transform: "rotate(-32deg)",
          transformOrigin: "left center",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: size * 0.6,
          top: size * 0.18,
          width: size * 0.22,
          height: size * 0.22,
          borderRadius: size,
          background: brand.accent,
        }}
      />
    </div>
  );
}
