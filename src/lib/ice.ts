type PeerRtcConfig = RTCConfiguration & { sdpSemantics?: string };

/** PeerJS's own defaults, kept underneath anything supplied through the environment. */
const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  {
    urls: ["turn:eu-0.turn.peerjs.com:3478", "turn:us-0.turn.peerjs.com:3478"],
    username: "peerjs",
    credential: "peerjsp",
  },
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
 * Two browsers that cannot open a direct path to each other need a relay, which
 * is the usual reason a board stays stuck on "waiting" between different
 * browsers or across restrictive networks. Supply one as a JSON array of
 * RTCIceServer entries in NEXT_PUBLIC_ICE_SERVERS. Returns undefined when
 * nothing is configured, which leaves PeerJS on its own defaults.
 */
export function peerConfig(): PeerRtcConfig | undefined {
  const configured = parseIceServers(process.env.NEXT_PUBLIC_ICE_SERVERS);
  if (configured.length === 0) return undefined;
  return {
    iceServers: [...DEFAULT_ICE_SERVERS, ...configured],
    sdpSemantics: "unified-plan",
  };
}
