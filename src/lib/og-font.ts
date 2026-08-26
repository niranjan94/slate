type FontWeight = 300 | 400 | 500 | 600;

/**
 * Satori rasterises ttf, otf and woff but not woff2, and Google Fonts only
 * serves plain ttf to clients that predate woff2, so the stylesheet request has
 * to claim to be one of them.
 */
const LEGACY_UA =
  "Mozilla/5.0 (Linux; U; Android 4.0.3; en-us) AppleWebKit/534.30 (KHTML, like Gecko) Version/4.0 Safari/534.30";

async function loadWeight(weight: FontWeight) {
  const stylesheet = await fetch(
    `https://fonts.googleapis.com/css2?family=Outfit:wght@${weight}`,
    { headers: { "User-Agent": LEGACY_UA } },
  ).then((response) => response.text());

  const source = stylesheet.match(/src: url\(([^)]+)\)/)?.[1];
  if (!source) {
    throw new Error(`Google Fonts returned no Outfit ${weight} source`);
  }

  const data = await fetch(source).then((response) => response.arrayBuffer());
  return { name: "Outfit", data, weight, style: "normal" as const };
}

/** Outfit, the typeface the app itself uses, ready to hand to ImageResponse. */
export function loadOutfit(weights: FontWeight[]) {
  return Promise.all(weights.map(loadWeight));
}
