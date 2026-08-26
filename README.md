# slate

A shared whiteboard for two, in the browser. Draw, erase, place text and drop in
pictures; everything you do appears on the other person's board as you do it.

Boards are peer-to-peer. PeerJS brokers the introduction between two browsers,
after which board data travels directly over a WebRTC data channel. State is a
[Yjs](https://yjs.dev) CRDT, so simultaneous edits merge rather than overwrite
each other, and each board is cached in IndexedDB so a refresh does not lose it.

## Running it

```bash
pnpm install
pnpm dev
```

Open `/`, start a board, and send the link or the five character room code to
one other person. Boards hold two.

| Script | Does |
| --- | --- |
| `pnpm dev` | Development server |
| `pnpm build` | Production build |
| `pnpm start` | Serve the production build |
| `pnpm lint` | Biome lint and format check |
| `pnpm format` | Biome format, writing changes |

## Connecting through a relay

Two browsers can only talk directly when the network lets them. Boards ship with
public STUN servers, which is enough whenever a direct path exists, including
two tabs of the same browser and most connections between different networks.

STUN is not always enough. Two different browser engines on one machine, and
strict or symmetric NATs, cannot open a direct path at all. Those cases need a
TURN relay, and without one the board sits on "waiting for someone to join".

There is no usable credential-free public TURN service, so a relay means
bringing your own: a TURN add-on from Cloudflare, Metered, Twilio or similar, or
self-hosted [coturn](https://github.com/coturn/coturn). Point
`NEXT_PUBLIC_ICE_SERVERS` at it as a JSON array of
[`RTCIceServer`](https://developer.mozilla.org/docs/Web/API/RTCIceServer)
entries and they are added to the built-in servers:

```bash
NEXT_PUBLIC_ICE_SERVERS='[{"urls":"turn:turn.example.com:3478","username":"user","credential":"secret"}]'
```

Entries the running browser refuses are dropped automatically, so one bad URL
cannot break the connection for everyone. WebKit, for instance, rejects any
`?transport=` query string and throws for the whole `RTCPeerConnection`; those
entries are simply skipped there and still used in Chromium and Firefox.

TURN credentials given this way are compiled into the client bundle and are
readable by anyone who loads the page. That is unavoidable for browser TURN, but
it means static credentials can be lifted and used against your relay quota.
Providers that issue short-lived credentials are worth preferring if that
matters.

The value is read at build time, so a deployment has to be rebuilt after
changing it. Relayed traffic passes through whichever server you point this at,
which is worth knowing given the rest of a board never touches a server.

## Layout

| Path | Holds |
| --- | --- |
| `src/app` | Routes: the lobby at `/` and a board at `/b/[code]` |
| `src/components` | Board surface, toolbar, lobby and overlays |
| `src/lib` | Document model, canvas painting, peer link and room codes |
