const MAX_DIMENSION = 1400;
const QUALITY = 0.86;

export type ImportedImage = { src: string; ratio: number };

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not decode image"));
    image.src = src;
  });
}

/**
 * WebKit encodes no webp at all and quietly answers with png, which for a photograph
 * is larger than the jpeg it came from, so jpeg is the fallback rather than the
 * untouched original: keeping the original would undo the downscale entirely.
 */
function encodeSmallest(canvas: HTMLCanvasElement): string {
  const webp = canvas.toDataURL("image/webp", QUALITY);
  if (webp.startsWith("data:image/webp")) return webp;
  return canvas.toDataURL("image/jpeg", QUALITY);
}

/**
 * Images travel inside the CRDT and therefore over the data channel, so a phone
 * photo is downscaled before it ever enters the document.
 */
export async function importImage(file: File): Promise<ImportedImage> {
  const original = await readAsDataUrl(file);
  const image = await loadImage(original);
  const width = image.naturalWidth || 1;
  const height = image.naturalHeight || 1;
  const ratio = width / height;
  const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));

  if (scale === 1 && original.length < 400_000) {
    return { src: original, ratio };
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return { src: original, ratio };
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  const encoded = encodeSmallest(canvas);
  // Re-encoding can inflate an already small file, and the original is fine then.
  return { src: encoded.length < original.length ? encoded : original, ratio };
}

export function imageFilesFrom(list: FileList | null | undefined): File[] {
  return Array.from(list ?? []).filter((file) =>
    file.type.startsWith("image/"),
  );
}
