import type { ImportedImage } from "./image-import";
import { PEER_NAMESPACE } from "./room";

export const COMPANION_VERSION = 1;

const NONCE_BYTES = 12;
const NONCE_PATTERN = /^[0-9a-f]{24}$/;

/**
 * A phone photo is paid for twice, once on the way to the board and again when the
 * CRDT carries it to the other peer, so an oversized payload is refused up front.
 */
export const MAX_IMAGE_SRC_LENGTH = 1_600_000;

/**
 * The nonce is scanned rather than typed, so the ambiguity-free alphabet room codes
 * use buys nothing here and hex keeps the full 96 bits of a bearer capability.
 */
export function generateCompanionNonce(): string {
  const bytes = new Uint8Array(NONCE_BYTES);
  crypto.getRandomValues(bytes);
  let nonce = "";
  for (const byte of bytes) nonce += byte.toString(16).padStart(2, "0");
  return nonce;
}

export function isValidCompanionNonce(raw: string): boolean {
  return NONCE_PATTERN.test(raw);
}

/** Addressed by nonce alone, so the pairing survives the room slot changing hands. */
export function companionPeerId(nonce: string): string {
  return `${PEER_NAMESPACE}-cam-${nonce}`;
}

export function addPath(nonce: string): string {
  return `/add/${nonce}`;
}

export function companionUrl(nonce: string): string {
  return new URL(addPath(nonce), window.location.origin).toString();
}

const NONCE_STORAGE_PREFIX = "slate-cam-";

/** Remembering the nonce lets a reloaded tab keep answering a QR that is already scanned. */
export function readCompanionNonce(code: string): string | null {
  try {
    const stored = localStorage.getItem(`${NONCE_STORAGE_PREFIX}${code}`) ?? "";
    return isValidCompanionNonce(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function storeCompanionNonce(code: string, nonce: string): void {
  try {
    localStorage.setItem(`${NONCE_STORAGE_PREFIX}${code}`, nonce);
  } catch {
    return;
  }
}

export type HelloMessage = {
  v: number;
  kind: "hello";
  code: string;
  name: string;
};

export type ImageMessage = {
  v: number;
  kind: "image";
  id: string;
  src: string;
  ratio: number;
};

export type AckReason = "too-large" | "no-board" | "rejected";

export type AckMessage = {
  v: number;
  kind: "ack";
  id: string;
  ok: boolean;
  reason?: AckReason;
};

export type CompanionMessage = HelloMessage | ImageMessage | AckMessage;

export function hello(code: string, name: string): HelloMessage {
  return { v: COMPANION_VERSION, kind: "hello", code, name };
}

export function imageMessage(image: ImportedImage): ImageMessage {
  return {
    v: COMPANION_VERSION,
    kind: "image",
    id: crypto.randomUUID(),
    src: image.src,
    ratio: image.ratio,
  };
}

export function ack(id: string, ok: boolean, reason?: AckReason): AckMessage {
  return reason
    ? { v: COMPANION_VERSION, kind: "ack", id, ok, reason }
    : { v: COMPANION_VERSION, kind: "ack", id, ok };
}

/** Anything at all can arrive over a data channel, so no field is trusted unchecked. */
export function parseCompanionMessage(data: unknown): CompanionMessage | null {
  if (typeof data !== "object" || data === null) return null;
  const message = data as Record<string, unknown>;
  if (message.v !== COMPANION_VERSION) return null;

  if (message.kind === "hello") {
    if (typeof message.code !== "string" || typeof message.name !== "string") {
      return null;
    }
    return hello(message.code, message.name);
  }

  if (message.kind === "image") {
    if (typeof message.id !== "string" || typeof message.src !== "string") {
      return null;
    }
    if (typeof message.ratio !== "number" || !Number.isFinite(message.ratio)) {
      return null;
    }
    if (message.ratio <= 0 || !message.src.startsWith("data:image/")) {
      return null;
    }
    return {
      v: COMPANION_VERSION,
      kind: "image",
      id: message.id,
      src: message.src,
      ratio: message.ratio,
    };
  }

  if (message.kind === "ack") {
    if (typeof message.id !== "string" || typeof message.ok !== "boolean") {
      return null;
    }
    const reason =
      typeof message.reason === "string"
        ? (message.reason as AckReason)
        : undefined;
    return ack(message.id, message.ok, reason);
  }

  return null;
}
