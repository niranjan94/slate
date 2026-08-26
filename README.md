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

Everyone arrives under a generated name and can change it, in the panel that
covers a new board or from the chip in the top left. The name is kept in this
browser and carries across boards.

| Script | Does |
| --- | --- |
| `pnpm dev` | Development server |
| `pnpm build` | Production build |
| `pnpm start` | Serve the production build |
| `pnpm lint` | Biome lint and format check |
| `pnpm format` | Biome format, writing changes |
| `pnpm test` | Unit tests |
| `pnpm test:e2e` | Browser tests |

## Tests

`pnpm test` runs the unit suite over the parts that can be checked without a
browser: the sync protocol driving two documents through the same code the data
channel uses, the board model and its undo scoping, text merging under
simultaneous edits, room codes, names, and ICE configuration.

`pnpm test:e2e` builds the app, serves it, and drives Chromium through the
drawing surface: ink, shapes, undo, erase, text placement and pruning, image
import, zoom, naming, and what survives a reload. One test claims a slot on the
public PeerJS broker, so it needs the network and says so; a failure there means
the broker was unreachable rather than the board being broken.

Neither suite covers two browsers talking to each other. That needs a relay, a
live broker and two engines, so it stays a manual check before deploying.

## The site URL

Canonical links, the social image, `robots.txt` and `sitemap.xml` all need an absolute address, and only the deployment knows what it is. Point `NEXT_PUBLIC_SITE_URL` at the origin the boards are served from:

```bash
NEXT_PUBLIC_SITE_URL=https://slate.example.com
```

It falls back to `http://localhost:3000`, and like the ICE server list it is read at build time, so a deployment has to be rebuilt after changing it.

Boards under `/b/` carry `noindex` and are excluded from `robots.txt`: a room code is the invitation to a board, so it has no business in a search index.

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
| `src/app` | Routes: the lobby at `/`, a board at `/b/[code]`, and the generated icons, social image, `robots.txt`, `sitemap.xml` and web manifest |
| `src/components` | Board surface, toolbar, lobby and overlays |
| `src/lib` | Document model, canvas painting, peer link, room codes and the logo mark |
