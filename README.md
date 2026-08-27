# slate

[![CI](https://github.com/niranjan94/slate/actions/workflows/ci.yml/badge.svg)](https://github.com/niranjan94/slate/actions/workflows/ci.yml)

A shared whiteboard in the browser. Draw, erase, place text, drop in pictures, or
scan a QR code to send photos from your phone. Everything appears on the other
board as you do it.

Peer to peer: [Trystero](https://trystero.dev) introduces the browsers over
Nostr relays, then board data goes straight over a WebRTC data channel. State is
a [Yjs](https://yjs.dev) CRDT, cached in IndexedDB. No server holds a board.

## Running it

```bash
pnpm install
pnpm dev
```

Open `/`, start a board, and send the link or the five character room code to
one other person. Boards hold two. Nothing needs configuring to draw locally;
`.env.example` documents the two deployment settings, both read at build time.

Press `?` on a board for the keyboard shortcuts.

## Connecting through a relay

Boards ship with public STUN, which is enough whenever a direct path exists.
Strict or symmetric NATs, and two different browser engines on one machine, need
a TURN relay instead. There is no credential-free public TURN, so bring your own
(Cloudflare, Metered, Twilio, or self-hosted [coturn](https://github.com/coturn/coturn))
and point `NEXT_PUBLIC_ICE_SERVERS` at it. Without one, those cases sit on
"waiting for the other person" forever.

Credentials set this way are compiled into the client bundle and readable by
anyone loading the page. Prefer a provider that issues short-lived ones.

## Scripts

| Script | Does |
| --- | --- |
| `pnpm dev` | Development server |
| `pnpm build` | Production build |
| `pnpm start` | Serve the production build |
| `pnpm lint` | Biome lint and format check |
| `pnpm typecheck` | Route typegen and TypeScript check |
| `pnpm format` | Biome format, writing changes |
| `pnpm test` | Unit tests |
| `pnpm test:e2e` | Browser tests |

`pnpm test` covers the sync protocol, board model, text merging, room codes and
ICE config. `pnpm test:e2e` drives Chromium through the drawing surface, plus a
phone sized project for touch. Two of those specs need the Nostr relays to be
reachable: two boards syncing, and phone pairing. CI runs all of it.

One thing the suite cannot check: a board shared between two browser engines.
That needs a relay and two real browsers, so it stays a manual check.

## Layout

| Path | Holds |
| --- | --- |
| `src/app` | Routes: lobby at `/`, board at `/b/[code]`, phone sender at `/add/[nonce]`, generated icons and metadata |
| `src/components` | Board surface, toolbar, lobby and overlays |
| `src/lib` | Document model, canvas painting, peer link, phone pairing, room codes |

## Contributing

Issues and pull requests welcome. `pnpm lint` and `pnpm test` should pass, and
`pnpm test:e2e` is worth running when a change touches the drawing surface.
Commit messages follow [Conventional Commits](https://www.conventionalcommits.org).

## License

[MIT](LICENSE), copyright 2026 Niranjan Rajendran.
