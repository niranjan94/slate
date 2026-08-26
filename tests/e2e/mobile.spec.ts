import { expect, type Page, test } from "@playwright/test";
import { inkPixels, openBoard, zoomLabel } from "./support/board";
import { touchInput } from "./support/touch";

const boardTransform = (page: Page) =>
  page
    .locator('[aria-label="Whiteboard surface"] > div')
    .first()
    .evaluate((node) => (node as HTMLElement).style.transform);

test.describe("one finger", () => {
  test("draws", async ({ page }) => {
    await openBoard(page);
    const touch = await touchInput(page);

    await touch.drag([110, 400], [280, 540]);

    expect(await inkPixels(page)).toBeGreaterThan(0);
  });
});

test.describe("two fingers", () => {
  test("zoom the board rather than drawing on it", async ({ page }) => {
    await openBoard(page);
    const touch = await touchInput(page);

    await touch.pinch([200, 430], 150, 320);

    expect(await inkPixels(page)).toBe(0);
    await expect(zoomLabel(page)).not.toHaveText("100%");
  });

  test("pan the board when they travel together", async ({ page }) => {
    await openBoard(page);
    const touch = await touchInput(page);

    await touch.down([120, 300], [220, 400]);
    await touch.move([200, 340], [300, 440]);
    await touch.up();

    expect(await boardTransform(page)).toContain("translate(80px, 40px)");
    await expect(zoomLabel(page)).toHaveText("100%");
  });

  test("take back the dab of ink the first finger left", async ({ page }) => {
    await openBoard(page);
    const touch = await touchInput(page);

    await touch.down([160, 400]);
    await touch.move([164, 404]);
    await touch.down([164, 404], [280, 520]);
    await touch.move([120, 360], [320, 560]);
    await touch.up();

    expect(await inkPixels(page)).toBe(0);
  });

  test("keep a stroke that was already worth keeping", async ({ page }) => {
    await openBoard(page);
    const touch = await touchInput(page);

    await touch.down([80, 300]);
    for (let step = 1; step <= 16; step += 1) {
      await touch.move([80 + step * 15, 300 + step * 11]);
    }
    await touch.down([320, 480], [180, 620]);
    await touch.up();

    expect(await inkPixels(page)).toBeGreaterThan(0);
  });
});

test("the finger left over from a pinch does not start drawing", async ({
  page,
}) => {
  await openBoard(page);
  const touch = await touchInput(page);

  await touch.down([140, 380], [260, 500]);
  await touch.move([120, 360], [280, 520]);
  await touch.down([120, 360]);
  for (let step = 1; step <= 10; step += 1) {
    await touch.move([120 + step * 16, 360]);
  }
  await touch.up();

  expect(await inkPixels(page)).toBe(0);
});

test.describe("a phone on its side", () => {
  test.use({ viewport: { width: 844, height: 390 } });

  test("can still reach the button that opens the board", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Start a new board" }).click();
    await page.waitForURL(/\/b\/[A-Z0-9]{5}$/);

    const start = page.getByRole("button", { name: "Start drawing" });
    await start.scrollIntoViewIfNeeded();
    await start.click();

    await expect(start).toBeHidden();
  });

  test("can still reach the button that closes the shortcut sheet", async ({
    page,
  }) => {
    await openBoard(page);
    await page.getByRole("button", { name: "Keyboard shortcuts" }).click();

    const done = page.getByRole("button", { name: "Done" });
    await done.scrollIntoViewIfNeeded();
    await done.click();

    await expect(done).toBeHidden();
  });
});
