export const SITE_NAME = "slate";

export const SITE_TAGLINE = "A shared whiteboard for two";

export const SITE_DESCRIPTION =
  "Draw, erase, place text and drop in pictures on a whiteboard you share with one other person. Boards travel directly between the two browsers over WebRTC, with no account and no server holding your work.";

/** Absolute base for canonical links, social images, robots and the sitemap. */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
).replace(/\/+$/, "");
