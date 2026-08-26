import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BoardRoomView } from "@/components/board-room";
import { isValidRoomCode, normalizeRoomCode } from "@/lib/room";

export async function generateMetadata({
  params,
}: PageProps<"/b/[code]">): Promise<Metadata> {
  const { code } = await params;
  const normalized = normalizeRoomCode(code);
  return {
    title: isValidRoomCode(normalized) ? `Board ${normalized}` : "Board",
    description:
      "A whiteboard you share, open in your browser. Your board stays in the browsers drawing on it.",
    robots: { index: false, follow: false },
  };
}

export default async function BoardPage({ params }: PageProps<"/b/[code]">) {
  const { code } = await params;
  const normalized = normalizeRoomCode(code);
  if (!isValidRoomCode(normalized)) notFound();
  return <BoardRoomView code={normalized} />;
}
