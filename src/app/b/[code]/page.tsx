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
      "A shared whiteboard for two, open in your browser. Boards live only in the two browsers drawing on them.",
    robots: { index: false, follow: false },
  };
}

export default async function BoardPage({ params }: PageProps<"/b/[code]">) {
  const { code } = await params;
  const normalized = normalizeRoomCode(code);
  if (!isValidRoomCode(normalized)) notFound();
  return <BoardRoomView code={normalized} />;
}
