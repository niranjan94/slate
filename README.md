# slate

A shared whiteboard for two, in the browser. Draw, erase, place text and drop in
pictures; everything you do appears on the other person's board as you do it.
Photograph something on your desk and it lands on the board, by pairing a phone
to the tab you have open.

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
import, zoom, naming, and what survives a reload. Two specs need the network and
say so: one claims a slot on the public PeerJS broker, and one pairs a phone page
to a board and sends a picture across it. A failure in either means the broker
was unreachable rather than the board being broken.

Phone pairing is the only peer to peer path the suite covers, and it covers it
because both ends are Chromium pages in one browser. Two people on one board
still needs a relay, a live broker and two engines, so that stays a manual check
before deploying.

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
anyone holding the link can put photos on that board until you press Revoke,
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
| `src/app` | Routes: the lobby at `/`, a board at `/b/[code]`, the phone sender at `/add/[nonce]`, and the generated icons, social image, `robots.txt`, `sitemap.xml` and web manifest |
| `src/components` | Board surface, toolbar, lobby and overlays |
| `src/lib` | Document model, canvas painting, peer link, phone pairing, room codes and the logo mark |
