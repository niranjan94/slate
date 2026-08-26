import { encode } from "uqr";

type QrCodeProps = {
  value: string;
  size?: number;
};

/**
 * Drawn as one path of unit squares against the matrix viewBox, so the code stays
 * crisp at any rendered size without a canvas or a raster round trip.
 */
export function QrCode({ value, size = 176 }: QrCodeProps) {
  const { data, size: modules } = encode(value, { ecc: "M", border: 2 });

  let path = "";
  for (let y = 0; y < modules; y += 1) {
    for (let x = 0; x < modules; x += 1) {
      if (data[y][x]) path += `M${x} ${y}h1v1h-1z`;
    }
  }

  return (
    <svg
      role="img"
      aria-label="Pairing code for this board"
      width={size}
      height={size}
      viewBox={`0 0 ${modules} ${modules}`}
      shapeRendering="crispEdges"
    >
      <rect width={modules} height={modules} className="fill-panel" />
      <path d={path} className="fill-ink" />
    </svg>
  );
}
