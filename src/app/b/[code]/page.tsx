import { notFound } from "next/navigation";
import { BoardRoomView } from "@/components/board-room";
import { isValidRoomCode, normalizeRoomCode } from "@/lib/room";

export default async function BoardPage({ params }: PageProps<"/b/[code]">) {
  const { code } = await params;
  const normalized = normalizeRoomCode(code);
  if (!isValidRoomCode(normalized)) notFound();
  return <BoardRoomView code={normalized} />;
}
