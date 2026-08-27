import { expect, test } from "@playwright/test";
import {
  createBoard,
  dismissGate,
  drag,
  inkPixels,
  openBoard,
} from "./support/board";

const REACHABLE = 45_000;

/**
 * The two tests here need the outside world: peers find each other through the
 * Nostr relay network. A failure means the relays are unreachable, not that the
 * board is broken.
 */
test("a new board opens and waits for someone", async ({ page }) => {
  await createBoard(page);

  await expect(page.getByText("Waiting for someone to join…")).toBeVisible({
    timeout: 30_000,
  });
});

test("two boards find each other and share what is drawn", async ({
  page,
  browser,
}) => {
  const code = await openBoard(page);

  // A separate context on purpose: two pages of one context share the
  // IndexedDB a board persists to, which would look like syncing without any
  // peering having happened at all.
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await guest.goto(`/b/${code}`);
  await guest.getByPlaceholder("Type your name").fill("Grace Hopper");
  await guest.getByPlaceholder("Type your name").press("Enter");
  await dismissGate(guest);

  await drag(page, [320, 300], [620, 500]);

  // Ink proves the document syncs; the name proves awareness does too, and the
  // two travel by different halves of the protocol.
  await expect
    .poll(() => inkPixels(guest), { timeout: REACHABLE })
    .toBeGreaterThan(0);
  await expect(page.getByText("Grace Hopper").first()).toBeVisible({
    timeout: REACHABLE,
  });

  await guestContext.close();
});

test("the room code is offered for sharing", async ({ page }) => {
  const code = await createBoard(page);
  const panel = page.getByText("Board code").locator("../..");

  await expect(panel.getByText(code, { exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Copy link" })).toBeVisible();
});
