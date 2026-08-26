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

Two browsers can only talk directly when the network lets them. Between
different browser engines, behind strict NATs, or on networks that block
peer-to-peer UDP, the direct path fails and a board sits on "waiting for someone
to join" forever.

The fix is a TURN relay. Set `NEXT_PUBLIC_ICE_SERVERS` to a JSON array of
[`RTCIceServer`](https://developer.mozilla.org/docs/Web/API/RTCIceServer)
entries and they are added to the ICE configuration:

```bash
NEXT_PUBLIC_ICE_SERVERS='[{"urls":"turn:turn.example.com:3478","username":"user","credential":"secret"}]'
```

Any TURN provider works, hosted or self-run. Leave the variable unset and PeerJS
falls back to its own defaults, which are enough whenever a direct connection is
possible. Note that relayed traffic passes through whichever server you point
this at.

## Layout

| Path | Holds |
| --- | --- |
| `src/app` | Routes: the lobby at `/` and a board at `/b/[code]` |
| `src/components` | Board surface, toolbar, lobby and overlays |
| `src/lib` | Document model, canvas painting, peer link and room codes |
