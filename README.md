# slate

[![CI](https://github.com/niranjan94/slate/actions/workflows/ci.yml/badge.svg)](https://github.com/niranjan94/slate/actions/workflows/ci.yml)

A shared whiteboard in the browser. Draw, erase, place text and drop in
pictures; everything you do appears on every other board as you do it.
Photograph something on your desk and it lands on the board, by pairing a phone
to the tab you have open.

Boards are peer-to-peer. [Trystero](https://trystero.dev) introduces the
browsers on a board to each other over the Nostr relay network, after which
board data travels directly over a WebRTC data channel. State is a
[Yjs](https://yjs.dev) CRDT, so simultaneous edits merge rather than overwrite
each other, and each board is cached in IndexedDB so a refresh does not lose it.

## Running it

```bash
pnpm install
pnpm dev
```

Open `/`, start a board, and send the link or the five character room code to
one other person. Boards hold two.

Nothing has to be configured to draw on a board locally. `.env.example` lists
the two settings a deployment wants, `NEXT_PUBLIC_SITE_URL` and
`NEXT_PUBLIC_ICE_SERVERS`; copy it to `.env.local` when you need either.

Everyone arrives under a generated name and can change it, in the panel that
covers a new board or from the chip in the top left. The name is kept in this
browser and carries across boards.

Move mode carries the handles for whatever you have placed. Click it to take it
in hand, then drag it about, drag the corner of a picture to resize it, drag the
handle above it to turn it, and press Backspace or the button in its corner to
take it off the board. Turning lands on a right angle when it is close to one,
or steps in fifteens while Shift is held. All of it is undoable, and a picture
you have just added arrives already in hand.

The keyboard reaches the same things. Arrows nudge what you have in hand and
hold Shift to nudge it ten, `[` and `]` turn it, ⌘D leaves a copy beside it, and
Backspace takes it off the board. Undo and Redo sit in the top right and answer
⌘Z and ⇧⌘Z. Press `?` for the whole list, which is also the button beside them.

## On a phone

One finger does whatever tool you have in hand. Two fingers move around the
board and zoom it, in any tool, so there is no need to reach for Pan first: if a
stroke had just started under the first finger it is taken back, unless it was
long enough to have been meant. Holding a finger still on a picture or a text box
picks it up whatever tool is in hand, and the same touch carries on into the
drag, which is how you move something without hunting for Move. The handles keep
their size and gain a finger's worth of reach around them, and a finger resting
on the board while a stylus draws is ignored.

Below the width the full dock needs, the dock carries the six tools alone and the
colours and nib sit in a row above it, for the tools that use them. Everything
else gathers into the menu beside Undo and Redo: your name, the link, a picture,
the camera, clearing the board, and the gestures above rather than a list of keys
the phone does not have. Pairing a phone to the board stays on the devices that
are not one.

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

## Tests

`pnpm test` runs the unit suite over the parts that can be checked without a
browser: the sync protocol driving two documents through the same code the data
channel uses, the board model and its undo scoping, text merging under
simultaneous edits, room codes, names, and ICE configuration.

`pnpm test:e2e` builds the app, serves it, and drives Chromium through the
drawing surface: ink, shapes, undo, erase, text placement and pruning, image
import, zoom, naming, and what survives a reload. Some specs need the network
and say so: two boards finding each other and sharing a stroke, and a phone page
pairing to a board and sending a picture across it. A failure in those means the
Nostr relays were unreachable rather than the board being broken.

A phone sized project runs `mobile.spec.ts` over the same build, dispatching real
touches through CDP: Playwright's own input API drives the mouse, and the surface
turns on the pointer type and on how many touches are down, so mouse events would
exercise none of it. That spec is also where the layout is held to fitting, with
nothing off an edge and nothing too small for a thumb.

The suite covers both peer to peer paths, two boards syncing and phone pairing,
because every end is a Chromium page driven from one run. What it cannot cover is
two browser engines: a board shared between Chromium and WebKit still needs a
relay and two real browsers, so that stays a manual check before deploying.

GitHub Actions runs the lint, type and unit checks alongside the browser suite
on every push to `main` and every pull request, and keeps the traces from a
failed browser run as an artifact. The specs that need the relay network run
there as well, so unreachable relays fail the run.

## The site URL

Canonical links, the social image, `robots.txt` and `sitemap.xml` all need an absolute address, and only the deployment knows what it is. Point `NEXT_PUBLIC_SITE_URL` at the origin the boards are served from:

```bash
NEXT_PUBLIC_SITE_URL=https://slate.example.com
```

It falls back to `http://localhost:3000`, and like the ICE server list it is read at build time, so a deployment has to be rebuilt after changing it.

Boards under `/b/` carry `noindex` and are excluded from `robots.txt`: a room code is the invitation to a board, so it has no business in a search index.

## Sending a photo from your phone

The Phone button on the toolbar opens a QR code. Scan it and that phone gets a
page it can take photos on; each one lands on the board as though you had dropped
the file in yourself, at the middle of whatever you are looking at and in hand
ready to be moved. A photo arriving mid stroke leaves the pen where it is rather
than taking the tool out from under you.

The phone does not join the board. Boards still hold two, and a phone is paired
to one tab rather than to the room, so both people can pair their own. What it
dials is a second peer the tab registers under a random 96 bit nonce, alongside
the room slot and unaffected by it. The nonce is the whole of the authorisation:
anyone holding the link can put photos on that board until you press New link,
which retires the link and issues a new one. It is a stronger secret than the
room code, which is five characters and already lets someone draw.

Pairing lives with the tab that offered it. Close the tab and the phone says the
link has expired; reload it and the same QR keeps working, because the nonce is
remembered for that board in this browser.

Photos are downscaled on the phone before they are sent, the same way a dropped
file is, so what crosses the wire is a webp of at most 1400px rather than a
camera original. The page uses the phone's own camera app through a file input
rather than asking for camera access, which means it needs no HTTPS and works
against a development server on your network. Set `NEXT_PUBLIC_SITE_URL` to an
address the phone can actually reach, or the QR will point at `localhost`.

One thing worth knowing before you rely on it: a phone on mobile data talking to
a computer on wifi is the case a direct connection almost never survives, so
these photos are usually the largest thing your TURN relay ever carries.

## Connecting through a relay

Two browsers can only talk directly when the network lets them. Boards ship with
public STUN servers, which is enough whenever a direct path exists, including
two tabs of the same browser and most connections between different networks.

STUN is not always enough. Two different browser engines on one machine, and
strict or symmetric NATs, cannot open a direct path at all. Those cases need a
TURN relay, and without one the board sits on "waiting for the other person".

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
| `src/app` | Routes: the lobby at `/`, a board at `/b/[code]`, the phone sender at `/add/[nonce]`, and the generated icons, social image, `robots.txt`, `sitemap.xml` and web manifest |
| `src/components` | Board surface, toolbar, lobby and overlays |
| `src/lib` | Document model, canvas painting, peer link, phone pairing, room codes and the logo mark |

## Contributing

Issues and pull requests are welcome. `pnpm lint` and `pnpm test` should pass
before a pull request, and `pnpm test:e2e` is worth running when a change
touches the drawing surface. Commit messages follow
[Conventional Commits](https://www.conventionalcommits.org).

Two people on one board, across two machines or two browser engines, is the one
thing the suite cannot check for you. It needs the relay network and two real
browsers, so please say whether you tried it when a change touches the peer link.

## License

[MIT](LICENSE), copyright 2026 Niranjan Rajendran.
