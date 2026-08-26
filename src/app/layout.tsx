import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import { brand } from "@/lib/brand";
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_URL,
} from "@/lib/site";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
});

const socialTitle = `${SITE_NAME}, ${SITE_TAGLINE.toLowerCase()}`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_NAME,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  category: "productivity",
  keywords: [
    "shared whiteboard",
    "collaborative whiteboard",
    "online whiteboard",
    "draw together",
    "peer-to-peer",
    "WebRTC",
    "Yjs",
    "CRDT",
    "no sign up",
    "open source",
  ],
  authors: [
    { name: "Niranjan Rajendran", url: "https://github.com/niranjan94" },
  ],
  creator: "Niranjan Rajendran",
  formatDetection: { telephone: false, address: false, email: false },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: socialTitle,
    description: SITE_DESCRIPTION,
    url: "/",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: socialTitle,
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  appleWebApp: {
    capable: true,
    title: SITE_NAME,
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: brand.paper,
  // Without cover, the safe area insets read as zero, and the board's chrome has to
  // know where the notch and the home indicator are to keep clear of them.
  viewportFit: "cover",
  // The board is one fixed surface with its chrome floating over it, so the on
  // screen keyboard has to shorten the viewport rather than slide the dock out
  // from under the visible part of it.
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${outfit.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
