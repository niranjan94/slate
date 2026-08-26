import { expect, test } from "@playwright/test";
import { createBoard } from "./support/board";

/**
 * The only test here that needs the outside world: it claims a slot on the
 * public PeerJS broker. A failure means the broker is unreachable, not that
 * the board is broken.
 */
test("a new board claims its slot and waits for someone", async ({ page }) => {
  await createBoard(page);

  await expect(page.getByText("Waiting for someone to join…")).toBeVisible({
    timeout: 30_000,
  });
});

test("the room code is offered for sharing", async ({ page }) => {
  const code = await createBoard(page);
  const panel = page.getByText("Room code").locator("../..");

  await expect(panel.getByText(code, { exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Copy link" })).toBeVisible();
});
