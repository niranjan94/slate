"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { joinRoom, selfId } from "trystero";
import {
  type AckReason,
  COMPANION_APP_ID,
  type CompanionMessage,
  type ImageMessage,
  imageMessage,
  join,
  MAX_IMAGE_SRC_LENGTH,
  parseCompanionMessage,
} from "@/lib/companion";
import { turnServers } from "@/lib/ice";
import { imageFilesFrom, importImage } from "@/lib/image-import";

const ACK_TIMEOUT_MS = 20_000;
/** How long a room with no board answering in it is given before it reads as expired. */
const HOST_WAIT_MS = 20_000;
const MESSAGE_ACTION = "msg";

type LinkState = "connecting" | "ready" | "waiting" | "gone" | "error";

type Board = { code: string; name: string };

type ItemState = "reading" | "sending" | "sent" | "failed";

type Item = {
  key: string;
  messageId: string | null;
  src: string;
  state: ItemState;
  note?: string;
};

const ACK_NOTES: Record<AckReason, string> = {
  "too-large": "too large to send",
  "no-board": "that board is no longer open",
  rejected: "the board refused it",
};

/** Data URLs are base64, so the transferred size is about three quarters of the text. */
function approximateSize(length: number): string {
  return `${((length * 3) / 4 / 1_000_000).toFixed(1)}MB`;
}

function noteFor(reason: string | undefined): string {
  if (!reason) return "did not arrive";
  return ACK_NOTES[reason as AckReason] ?? "did not arrive";
}

const LINK_TEXT: Record<LinkState, string> = {
  connecting: "Finding the board…",
  ready: "Connected",
  waiting: "Reconnecting…",
  gone: "That link has expired. Scan the code again.",
  error: "This browser cannot connect. Try Chrome or Safari.",
};

const INPUT_CLASS = "sr-only";
const BUTTON_CLASS =
  "flex w-full cursor-pointer items-center justify-center rounded-xl px-[18px] py-[17px] text-[15px] font-medium transition-colors";

export function PhoneSender({ nonce }: { nonce: string }) {
  const [link, setLink] = useState<LinkState>("connecting");
  const [board, setBoard] = useState<Board | null>(null);
  const [stale, setStale] = useState(false);
  const [items, setItems] = useState<Item[]>([]);

  const hostRef = useRef<string | null>(null);
  const sendRef = useRef<
    ((message: CompanionMessage) => Promise<void> | null) | null
  >(null);
  const waitersRef = useRef(
    new Map<string, (ok: boolean, reason?: string) => void>(),
  );
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  const patch = useCallback((key: string, next: Partial<Item>) => {
    setItems((prev) =>
      prev.map((item) => (item.key === key ? { ...item, ...next } : item)),
    );
  }, []);

  useEffect(() => {
    // Trystero builds an RTCPeerConnection per peer, so a browser without one
    // never gets as far as looking for the board.
    if (typeof RTCPeerConnection === "undefined") {
      setLink("error");
      return;
    }

    let disposed = false;
    let goneTimer: ReturnType<typeof setTimeout> | null = null;

    const clearGoneTimer = () => {
      if (goneTimer) clearTimeout(goneTimer);
      goneTimer = null;
    };

    /**
     * Nothing tells a nonce nobody is listening on apart from one whose board is
     * briefly away, so silence is given a deadline rather than waited on.
     */
    const armGoneTimer = () => {
      clearGoneTimer();
      goneTimer = setTimeout(() => {
        goneTimer = null;
        if (!disposed) setLink("gone");
      }, HOST_WAIT_MS);
    };

    const room = joinRoom(
      { appId: COMPANION_APP_ID, turnConfig: turnServers() },
      nonce,
    );
    const messages = room.makeAction<CompanionMessage>(MESSAGE_ACTION);

    sendRef.current = (message) => {
      const host = hostRef.current;
      return host ? messages.send(message, { target: host }) : null;
    };

    messages.onMessage = (data, { peerId }) => {
      const message = parseCompanionMessage(data);
      if (!message) {
        // A shaped message this build cannot read means the two sides disagree.
        if (typeof data === "object" && data !== null && "kind" in data) {
          setStale(true);
        }
        return;
      }
      if (message.kind === "join") {
        if (message.role !== "host") return;
        hostRef.current = peerId;
        clearGoneTimer();
        setLink("ready");
        return;
      }
      if (message.kind === "hello") {
        setBoard({ code: message.code, name: message.name });
        return;
      }
      if (message.kind === "ack") {
        waitersRef.current.get(message.id)?.(message.ok, message.reason);
      }
    };

    room.onPeerJoin = (peerId) => {
      void messages.send(join("phone", selfId), { target: peerId });
    };

    room.onPeerLeave = (peerId) => {
      if (disposed || hostRef.current !== peerId) return;
      hostRef.current = null;
      setLink("waiting");
      armGoneTimer();
    };

    armGoneTimer();

    return () => {
      disposed = true;
      clearGoneTimer();
      hostRef.current = null;
      sendRef.current = null;
      void room.leave();
    };
  }, [nonce]);

  const awaitAck = useCallback(
    (id: string) =>
      new Promise<{ ok: boolean; reason?: string }>((resolve) => {
        const timer = setTimeout(() => {
          waitersRef.current.delete(id);
          resolve({ ok: false });
        }, ACK_TIMEOUT_MS);
        waitersRef.current.set(id, (ok, reason) => {
          clearTimeout(timer);
          waitersRef.current.delete(id);
          resolve({ ok, reason });
        });
      }),
    [],
  );

  const deliver = useCallback(
    async (key: string, message: ImageMessage) => {
      const inFlight = sendRef.current?.(message);
      if (!inFlight) {
        patch(key, { state: "failed", note: "no connection to the board" });
        return;
      }
      patch(key, { state: "sending" });
      try {
        await inFlight;
      } catch {
        patch(key, { state: "failed", note: "no connection to the board" });
        return;
      }
      const { ok, reason } = await awaitAck(message.id);
      if (ok) patch(key, { state: "sent", note: undefined });
      else patch(key, { state: "failed", note: noteFor(reason) });
    },
    [awaitAck, patch],
  );

  const addFiles = useCallback(
    async (files: File[]) => {
      for (const file of files) {
        const key = crypto.randomUUID();
        setItems((prev) => [
          ...prev,
          { key, messageId: null, src: "", state: "reading" },
        ]);
        try {
          // Downscaled here so the channel carries a photo, not a camera original.
          const image = await importImage(file);
          if (image.src.length > MAX_IMAGE_SRC_LENGTH) {
            // Refused here rather than after the transfer the board would reject.
            patch(key, {
              src: image.src,
              state: "failed",
              note: `too large to send at ${approximateSize(image.src.length)}`,
            });
            continue;
          }
          const message = imageMessage(image);
          patch(key, { messageId: message.id, src: image.src });
          // One send in flight at a time, so a burst cannot outrun the acks.
          queueRef.current = queueRef.current.then(
            () => deliver(key, message),
            () => deliver(key, message),
          );
        } catch {
          patch(key, { state: "failed", note: "could not be read" });
        }
      }
    },
    [deliver, patch],
  );

  const onPicked = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = imageFilesFrom(event.target.files);
      event.target.value = "";
      if (files.length > 0) void addFiles(files);
    },
    [addFiles],
  );

  const target = board
    ? `${board.name}'s board · ${board.code}`
    : "a board on another screen";

  return (
    <main className="mx-auto flex min-h-full w-full max-w-[440px] flex-col px-5 pt-8 pb-10">
      <div className="flex items-baseline gap-[9px]">
        <span className="text-[25px] font-semibold tracking-[-0.02em]">
          slate
        </span>
        <span className="pb-0.5 text-[10.5px] font-medium tracking-[0.09em] text-ink-faint uppercase">
          send a photo
        </span>
      </div>

      <p className="mt-2.5 text-[14.5px] leading-[1.55] text-ink-muted text-pretty">
        Photos you take here appear on {target}. You are only sending photos,
        not drawing.
      </p>

      <div className="mt-4 mb-6 flex items-center gap-2.5">
        <div
          className={`size-[9px] shrink-0 rounded-full ${
            link === "ready"
              ? "bg-accent"
              : link === "gone" || link === "error"
                ? "bg-peer"
                : "bg-amber"
          }`}
        />
        <span className="text-sm text-ink-muted">
          {stale
            ? "Refresh both screens to get back in sync."
            : LINK_TEXT[link]}
        </span>
      </div>

      <div className="flex flex-col gap-2.5">
        <label className={`${BUTTON_CLASS} bg-ink text-ink-invert`}>
          Take a photo
          <input
            type="file"
            accept="image/*"
            capture="environment"
            aria-label="Take a photo"
            className={INPUT_CLASS}
            onChange={onPicked}
          />
        </label>
        <label
          className={`${BUTTON_CLASS} border border-line-strong bg-panel text-ink`}
        >
          Choose a photo
          <input
            type="file"
            accept="image/*"
            multiple
            aria-label="Choose a photo"
            className={INPUT_CLASS}
            onChange={onPicked}
          />
        </label>
      </div>

      {items.length > 0 && (
        <ul className="mt-7 flex flex-col gap-2.5">
          {items.map((item) => (
            <li
              key={item.key}
              className="flex items-center gap-3 rounded-xl border border-line bg-panel p-2.5"
            >
              <div
                className="size-11 shrink-0 rounded-lg bg-field bg-cover bg-center"
                style={
                  item.src
                    ? { backgroundImage: `url("${item.src}")` }
                    : undefined
                }
              />
              <span className="text-[13.5px] text-ink-muted">
                {item.state === "reading" && "Reading the photo…"}
                {item.state === "sending" && "Sending…"}
                {item.state === "sent" && "On the board"}
                {item.state === "failed" && `Not sent · ${item.note}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
