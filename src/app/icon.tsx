import { ImageResponse } from "next/og";
import { BrandMark } from "@/lib/brand";

const SIZES = [32, 192, 512];

export function generateImageMetadata() {
  return SIZES.map((size) => ({
    id: String(size),
    size: { width: size, height: size },
    contentType: "image/png",
  }));
}

export default async function Icon({ id }: { id: Promise<string> }) {
  const size = Number(await id);
  return new ImageResponse(<BrandMark size={size} />, {
    width: size,
    height: size,
  });
}
