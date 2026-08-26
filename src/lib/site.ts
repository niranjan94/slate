export const SITE_NAME = "slate";

export const SITE_TAGLINE = "A whiteboard you share";

export const SITE_DESCRIPTION =
  "Draw, write and drop in photos on a whiteboard you share with someone else. Send a link, they join, and every stroke shows up as it happens. No sign-up, and your board stays in your browser.";

/** Absolute base for canonical links, social images, robots and the sitemap. */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
).replace(/\/+$/, "");
