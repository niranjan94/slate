import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * `peerConfig` memoises, and the servers come from a build-time env var, so
 * each case needs the module loaded afresh.
 */
async function configWith(raw: string | undefined) {
  vi.resetModules();
  if (raw === undefined) delete process.env.NEXT_PUBLIC_ICE_SERVERS;
  else process.env.NEXT_PUBLIC_ICE_SERVERS = raw;
  const { peerConfig } = await import("@/lib/ice");
  return peerConfig();
}

const urlsOf = (config: RTCConfiguration) =>
  (config.iceServers ?? []).flatMap((server) =>
    Array.isArray(server.urls) ? server.urls : [server.urls],
  );

afterEach(() => {
  delete process.env.NEXT_PUBLIC_ICE_SERVERS;
  vi.unstubAllGlobals();
});

describe("peerConfig", () => {
  it("ships reachable STUN servers when nothing is configured", async () => {
    const urls = urlsOf(await configWith(undefined));

    expect(urls.length).toBeGreaterThan(0);
    expect(urls.every((url) => url.startsWith("stun:"))).toBe(true);
  });

  it("leaves out the PeerJS defaults that no longer resolve", async () => {
    const urls = urlsOf(await configWith(undefined));

    expect(urls.join(" ")).not.toContain("turn.peerjs.com");
  });

  it("asks for unified plan, which is all PeerJS reads off this object", async () => {
    expect((await configWith(undefined)).sdpSemantics).toBe("unified-plan");
  });

  it("appends a configured relay to the baseline", async () => {
    const config = await configWith(
      JSON.stringify([
        { urls: "turn:relay.example:3478", username: "u", credential: "c" },
      ]),
    );

    expect(urlsOf(config)).toContain("turn:relay.example:3478");
    expect(urlsOf(config).some((url) => url.startsWith("stun:"))).toBe(true);
  });

  it("carries the credentials through, since a relay is useless without them", async () => {
    const config = await configWith(
      JSON.stringify([
        { urls: "turn:relay.example:3478", username: "u", credential: "c" },
      ]),
    );
    const relay = (config.iceServers ?? []).find((server) => server.username);

    expect(relay).toMatchObject({ username: "u", credential: "c" });
  });

  it("accepts a lone object as well as an array", async () => {
    const config = await configWith(
      JSON.stringify({ urls: "turn:relay.example:3478" }),
    );

    expect(urlsOf(config)).toContain("turn:relay.example:3478");
  });

  it("accepts an entry listing several urls", async () => {
    const config = await configWith(
      JSON.stringify([
        { urls: ["turn:a.example:3478", "turn:b.example:3478"] },
      ]),
    );

    expect(urlsOf(config)).toEqual(
      expect.arrayContaining(["turn:a.example:3478", "turn:b.example:3478"]),
    );
  });

  it("falls back to the baseline rather than throwing on malformed json", async () => {
    const urls = urlsOf(await configWith("{ not json"));

    expect(urls.every((url) => url.startsWith("stun:"))).toBe(true);
  });

  it("ignores an entry with no urls at all", async () => {
    const config = await configWith(
      JSON.stringify([{ username: "u", credential: "c" }]),
    );

    expect((config.iceServers ?? []).some((server) => server.username)).toBe(
      false,
    );
  });

  it("ignores an empty value", async () => {
    const urls = urlsOf(await configWith(""));

    expect(urls.every((url) => url.startsWith("stun:"))).toBe(true);
  });

  it("memoises, so repeat calls do not re-probe the browser", async () => {
    vi.resetModules();
    const { peerConfig } = await import("@/lib/ice");

    expect(peerConfig()).toBe(peerConfig());
  });
});

describe("engine compatibility", () => {
  /** WebKit throws on a `?transport=` TURN url, and one bad entry kills the whole connection. */
  it("drops a server the running browser refuses to construct", async () => {
    vi.stubGlobal(
      "RTCPeerConnection",
      class {
        constructor(config: RTCConfiguration) {
          const urls = (config.iceServers ?? []).flatMap((server) =>
            Array.isArray(server.urls) ? server.urls : [server.urls],
          );
          if (urls.some((url) => url.includes("?transport="))) {
            throw new SyntaxError("Invalid TURN URL query string");
          }
        }
        close() {}
      },
    );

    const config = await configWith(
      JSON.stringify([
        { urls: "turn:relay.example:3478" },
        { urls: "turn:relay.example:3478?transport=tcp" },
      ]),
    );

    expect(urlsOf(config)).toContain("turn:relay.example:3478");
    expect(urlsOf(config)).not.toContain(
      "turn:relay.example:3478?transport=tcp",
    );
  });

  it("keeps every server when the browser accepts them all", async () => {
    vi.stubGlobal(
      "RTCPeerConnection",
      class {
        close() {}
      },
    );

    const config = await configWith(
      JSON.stringify([
        { urls: "turn:relay.example:3478" },
        { urls: "turn:relay.example:3478?transport=tcp" },
      ]),
    );

    expect(urlsOf(config)).toContain("turn:relay.example:3478?transport=tcp");
  });

  it("keeps everything where there is no WebRTC to ask, as on the server", async () => {
    const config = await configWith(
      JSON.stringify([{ urls: "turn:relay.example:3478?transport=tcp" }]),
    );

    expect(urlsOf(config)).toContain("turn:relay.example:3478?transport=tcp");
  });
});
