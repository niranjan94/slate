"use client";

import Peer, { type DataConnection } from "peerjs";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type AckReason,
  companionPeerId,
  type ImageMessage,
  imageMessage,
  parseCompanionMessage,
} from "@/lib/companion";
import { peerConfig } from "@/lib/ice";
import { imageFilesFrom, importImage } from "@/lib/image-import";

const ACK_TIMEOUT_MS = 20_000;
const DIAL_ATTEMPTS = 4;
const RETRY_STEP_MS = 600;
const DIAL_TIMEOUT_MS = 6_000;

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

function noteFor(reason: string | undefined): string {
  if (!reason) return "did not arrive";
  return ACK_NOTES[reason as AckReason] ?? "did not arrive";
}

const LINK_TEXT: Record<LinkState, string> = {
  connecting: "Finding the board…",
  ready: "Connected",
  waiting: "Reconnecting…",
  gone: "That link has expired. Scan the code again.",
  error: "This browser cannot open the connection.",
};

const INPUT_CLASS = "sr-only";
const BUTTON_CLASS =
  "flex w-full cursor-pointer items-center justify-center rounded-xl px-[18px] py-[17px] text-[15px] font-medium transition-colors";

export function PhoneSender({ nonce }: { nonce: string }) {
  const [link, setLink] = useState<LinkState>("connecting");
  const [board, setBoard] = useState<Board | null>(null);
  const [stale, setStale] = useState(false);
  const [items, setItems] = useState<Item[]>([]);

  const connRef = useRef<DataConnection | null>(null);
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
    let disposed = false;
    let attempts = 0;
    let peer: Peer | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let dialTimer: ReturnType<typeof setTimeout> | null = null;

    const clearDialTimer = () => {
      if (dialTimer) clearTimeout(dialTimer);
      dialTimer = null;
    };

    const teardown = () => {
      const mine = peer;
      peer = null;
      mine?.destroy();
    };

    const retry = () => {
      if (disposed || retryTimer) return;
      clearDialTimer();
      teardown();
      if (attempts >= DIAL_ATTEMPTS) {
        setLink("gone");
        return;
      }
      setLink("waiting");
      retryTimer = setTimeout(() => {
        retryTimer = null;
        open();
      }, RETRY_STEP_MS * attempts);
    };

    const dial = (mine: Peer) => {
      const conn = mine.connect(companionPeerId(nonce), { reliable: true });
      // The broker names an unknown id on the first dial and then goes quiet, even for
      // a fresh peer, so a silent attempt has to be bounded rather than waited on.
      dialTimer = setTimeout(() => {
        dialTimer = null;
        if (!disposed && !conn.open) retry();
      }, DIAL_TIMEOUT_MS);

      conn.on("open", () => {
        clearDialTimer();
        if (disposed || peer !== mine) return;
        attempts = 0;
        connRef.current = conn;
        setLink("ready");
      });

      conn.on("data", (data) => {
        const message = parseCompanionMessage(data);
        if (!message) {
          // A shaped message this build cannot read means the two sides disagree.
          if (typeof data === "object" && data !== null && "kind" in data) {
            setStale(true);
          }
          return;
        }
        if (message.kind === "hello") {
          setBoard({ code: message.code, name: message.name });
          return;
        }
        if (message.kind === "ack") {
          waitersRef.current.get(message.id)?.(message.ok, message.reason);
        }
      });

      const lost = () => {
        if (connRef.current === conn) connRef.current = null;
        if (!disposed) retry();
      };
      conn.on("close", lost);
      conn.on("error", lost);
    };

    /**
     * A fresh peer per attempt on purpose: PeerJS reports an unknown id only on the
     * first dial of a given peer and stays silent afterwards, so reusing one leaves
     * every later attempt waiting for an error that never arrives.
     */
    const open = () => {
      if (disposed) return;
      attempts += 1;
      const mine = new Peer({ debug: 0, config: peerConfig() });
      peer = mine;

      mine.on("open", () => {
        if (disposed || peer !== mine) {
          mine.destroy();
          return;
        }
        dial(mine);
      });

      mine.on("error", (error) => {
        if (disposed || peer !== mine) return;
        if (error.type === "browser-incompatible") {
          setLink("error");
          return;
        }
        retry();
      });
    };

    open();

    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      clearDialTimer();
      connRef.current = null;
      teardown();
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
      const conn = connRef.current;
      if (!conn?.open) {
        patch(key, { state: "failed", note: "no connection to the board" });
        return;
      }
      patch(key, { state: "sending" });
      try {
        conn.send(message);
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
        Photos you take here land on {target}. This phone is not drawing on it.
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
          {stale ? "One side is out of date. Reload both." : LINK_TEXT[link]}
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
