import type { TurnServerConfig } from "trystero";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * `turnServers` memoises, and the servers come from a build-time env var, so
 * each case needs the module loaded afresh.
 */
async function serversWith(raw: string | undefined) {
  vi.resetModules();
  if (raw === undefined) delete process.env.NEXT_PUBLIC_ICE_SERVERS;
  else process.env.NEXT_PUBLIC_ICE_SERVERS = raw;
  const { turnServers } = await import("@/lib/ice");
  return turnServers();
}

const urlsOf = (servers: TurnServerConfig[]) =>
  servers.flatMap((server) =>
    Array.isArray(server.urls) ? server.urls : [server.urls],
  );

afterEach(() => {
  delete process.env.NEXT_PUBLIC_ICE_SERVERS;
  vi.unstubAllGlobals();
});

describe("turnServers", () => {
  it("adds nothing when no relay is configured, since Trystero brings STUN", async () => {
    expect(await serversWith(undefined)).toEqual([]);
  });

  it("returns a configured relay", async () => {
    const servers = await serversWith(
      JSON.stringify([
        { urls: "turn:relay.example:3478", username: "u", credential: "c" },
      ]),
    );

    expect(urlsOf(servers)).toContain("turn:relay.example:3478");
  });

  it("carries the credentials through, since a relay is useless without them", async () => {
    const servers = await serversWith(
      JSON.stringify([
        { urls: "turn:relay.example:3478", username: "u", credential: "c" },
      ]),
    );

    expect(servers[0]).toMatchObject({ username: "u", credential: "c" });
  });

  it("accepts a lone object as well as an array", async () => {
    const servers = await serversWith(
      JSON.stringify({ urls: "turn:relay.example:3478" }),
    );

    expect(urlsOf(servers)).toContain("turn:relay.example:3478");
  });

  it("accepts an entry listing several urls", async () => {
    const servers = await serversWith(
      JSON.stringify([
        { urls: ["turn:a.example:3478", "turn:b.example:3478"] },
      ]),
    );

    expect(urlsOf(servers)).toEqual(
      expect.arrayContaining(["turn:a.example:3478", "turn:b.example:3478"]),
    );
  });

  it("adds nothing rather than throwing on malformed json", async () => {
    expect(await serversWith("{ not json")).toEqual([]);
  });

  it("ignores an entry with no urls at all", async () => {
    const servers = await serversWith(
      JSON.stringify([{ username: "u", credential: "c" }]),
    );

    expect(servers).toEqual([]);
  });

  it("ignores an empty value", async () => {
    expect(await serversWith("")).toEqual([]);
  });

  it("memoises, so repeat calls do not re-probe the browser", async () => {
    vi.resetModules();
    const { turnServers } = await import("@/lib/ice");

    expect(turnServers()).toBe(turnServers());
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

    const servers = await serversWith(
      JSON.stringify([
        { urls: "turn:relay.example:3478" },
        { urls: "turn:relay.example:3478?transport=tcp" },
      ]),
    );

    expect(urlsOf(servers)).toContain("turn:relay.example:3478");
    expect(urlsOf(servers)).not.toContain(
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

    const servers = await serversWith(
      JSON.stringify([
        { urls: "turn:relay.example:3478" },
        { urls: "turn:relay.example:3478?transport=tcp" },
      ]),
    );

    expect(urlsOf(servers)).toContain("turn:relay.example:3478?transport=tcp");
  });

  it("keeps everything where there is no WebRTC to ask, as on the server", async () => {
    const servers = await serversWith(
      JSON.stringify([{ urls: "turn:relay.example:3478?transport=tcp" }]),
    );

    expect(urlsOf(servers)).toContain("turn:relay.example:3478?transport=tcp");
  });
});
