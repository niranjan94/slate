import type { TurnServerConfig } from "trystero";

function parseTurnServers(raw: string | undefined): TurnServerConfig[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    const entries = Array.isArray(parsed) ? parsed : [parsed];
    return entries.filter((entry): entry is TurnServerConfig => {
      const urls = (entry as TurnServerConfig | null)?.urls;
      return typeof urls === "string" || Array.isArray(urls);
    });
  } catch {
    return [];
  }
}

function isUsable(server: TurnServerConfig): boolean {
  if (typeof RTCPeerConnection === "undefined") return true;
  try {
    new RTCPeerConnection({ iceServers: [server] }).close();
    return true;
  } catch {
    return false;
  }
}

let cached: TurnServerConfig[] | null = null;

/**
 * Trystero already gathers against public STUN servers, which is enough only
 * when the two browsers can open a direct path. Different browser engines on
 * one machine, and strict NATs, need a TURN relay: supply one as a JSON array
 * of RTCIceServer entries in NEXT_PUBLIC_ICE_SERVERS and it is appended to the
 * built-in servers.
 */
export function turnServers(): TurnServerConfig[] {
  // Engines disagree on TURN URL syntax: WebKit rejects a ?transport= query
  // string outright, and one bad entry throws for the whole connection. Keep
  // only what this browser will actually accept.
  cached ??= parseTurnServers(process.env.NEXT_PUBLIC_ICE_SERVERS).filter(
    isUsable,
  );
  return cached;
}
