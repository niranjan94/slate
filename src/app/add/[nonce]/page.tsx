import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PhoneSender } from "@/components/phone-sender";
import { isValidCompanionNonce } from "@/lib/companion";

export const metadata: Metadata = {
  title: "Send a photo",
  description:
    "Send a photo from this phone to a slate board that is already open on another screen.",
  robots: { index: false, follow: false },
};

export default async function AddPage({ params }: PageProps<"/add/[nonce]">) {
  const { nonce } = await params;
  if (!isValidCompanionNonce(nonce)) notFound();
  return <PhoneSender nonce={nonce} />;
}
