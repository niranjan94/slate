import { expect, test } from "@playwright/test";
import { openBoard, pictureCount, toolButton } from "./support/board";

const SAMPLE_PNG = "tests/e2e/fixtures/sample.png";
const REACHABLE = 30_000;

/**
 * Like signalling.spec.ts, this one needs the outside world: the phone reaches the
 * board through the Nostr relay network. A failure means the relays are unreachable,
 * not that pairing is broken.
 */
test("a photo sent from a phone lands on the board", async ({
  page,
  context,
}) => {
  await openBoard(page);
  await toolButton(page, "Phone").click();

  const link = page.getByText(/\/add\/[0-9a-f]{24}/).first();
  await expect(link).toBeVisible({ timeout: REACHABLE });
  const url = (await link.innerText()).trim();

  const phone = await context.newPage();
  await phone.goto(url);
  await expect(phone.getByText("Connected")).toBeVisible({
    timeout: REACHABLE,
  });

  await phone.getByLabel("Take a photo").setInputFiles(SAMPLE_PNG);

  await expect(phone.getByText("On the board")).toBeVisible({
    timeout: REACHABLE,
  });
  await expect.poll(() => pictureCount(page), { timeout: REACHABLE }).toBe(1);
});

test("an arriving photo switches to the tool that can move it", async ({
  page,
  context,
}) => {
  await openBoard(page);
  await toolButton(page, "Phone").click();

  const link = page.getByText(/\/add\/[0-9a-f]{24}/).first();
  await expect(link).toBeVisible({ timeout: REACHABLE });

  const phone = await context.newPage();
  await phone.goto((await link.innerText()).trim());
  await expect(phone.getByText("Connected")).toBeVisible({
    timeout: REACHABLE,
  });
  await phone.getByLabel("Take a photo").setInputFiles(SAMPLE_PNG);

  await expect.poll(() => pictureCount(page), { timeout: REACHABLE }).toBe(1);
  await expect(page.locator("body")).toContainText("drag to move");
  await expect(page.getByRole("button", { name: "Remove" })).toHaveCount(1);
});

/**
 * A nonce with nobody listening on it is only declared expired once a fixed wait
 * elapses, so only the honest intermediate state is asserted here. The terminal
 * copy is not worth a timing dependent test.
 */
test("a phone with no board to reach says it is still looking", async ({
  page,
}) => {
  await page.goto("/add/0123456789abcdef01234567");

  await expect(page.getByText(/Finding the board|Reconnecting/)).toBeVisible({
    timeout: REACHABLE,
  });
  await expect(page.getByText("Connected")).toBeHidden();
});

test("a link that is not a nonce is not a page", async ({ page }) => {
  const response = await page.goto("/add/nope");

  expect(response?.status()).toBe(404);
});
