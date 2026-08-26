type PeerRtcConfig = RTCConfiguration & { sdpSemantics?: string };

/**
 * PeerJS ships its own defaults, but its TURN hosts (eu-0/us-0.turn.peerjs.com)
 * no longer resolve, so every candidate gathering wastes time on a DNS failure.
 * These STUN servers are reachable and replace that baseline.
 */
const BASE_ICE_SERVERS: RTCIceServer[] = [
  {
    urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"],
  },
  { urls: "stun:stun.cloudflare.com:3478" },
];

function parseIceServers(raw: string | undefined): RTCIceServer[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    const entries = Array.isArray(parsed) ? parsed : [parsed];
    return entries.filter((entry): entry is RTCIceServer => {
      const urls = (entry as RTCIceServer | null)?.urls;
      return typeof urls === "string" || Array.isArray(urls);
    });
  } catch {
    return [];
  }
}

/**
 * STUN alone only works when the two browsers can open a direct path. Different
 * browser engines on one machine, and strict NATs, need a TURN relay: supply one
 * as a JSON array of RTCIceServer entries in NEXT_PUBLIC_ICE_SERVERS and it is
 * appended to the servers below.
 */
export function peerConfig(): PeerRtcConfig {
  return {
    iceServers: [
      ...BASE_ICE_SERVERS,
      ...parseIceServers(process.env.NEXT_PUBLIC_ICE_SERVERS),
    ],
    sdpSemantics: "unified-plan",
  };
}
