import { expect, type Page, test } from "@playwright/test";
import { inkPixels, openBoard, toolButton, zoomLabel } from "./support/board";
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

/** Every control has to be inside the screen and big enough to hit with a thumb. */
const controls = (page: Page) =>
  page.locator("button").evaluateAll((nodes) =>
    nodes
      .map((node) => {
        const box = node.getBoundingClientRect();
        return {
          label: (
            node.getAttribute("aria-label") ||
            node.textContent ||
            "?"
          ).trim(),
          width: box.width,
          height: box.height,
          offScreen:
            box.left < -0.5 ||
            box.right > window.innerWidth + 0.5 ||
            box.top < -0.5 ||
            box.bottom > window.innerHeight + 0.5,
        };
      })
      .filter((control) => control.width > 0),
  );

test.describe("the dock on a phone", () => {
  test("puts every tool on the screen", async ({ page }) => {
    await openBoard(page);

    for (const label of ["Draw", "Erase", "Text", "Shape", "Move", "Pan"]) {
      await expect(toolButton(page, label)).toBeInViewport();
    }
  });

  test("leaves nothing off the edge and nothing too small to hit", async ({
    page,
  }) => {
    await openBoard(page);

    const found = await controls(page);
    expect(found.filter((control) => control.offScreen)).toEqual([]);
    expect(found.filter((control) => control.height < 36)).toEqual([]);
  });

  test("keeps the pen reachable after another tool has been used", async ({
    page,
  }) => {
    await openBoard(page);
    const touch = await touchInput(page);

    await toolButton(page, "Move").click();
    await toolButton(page, "Draw").click();
    await touch.drag([110, 400], [280, 520]);

    expect(await inkPixels(page)).toBeGreaterThan(0);
  });

  test("offers the colours and the nib for the tools that use them", async ({
    page,
  }) => {
    await openBoard(page);

    await expect(page.getByRole("button", { name: "Blue" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Bold" })).toBeVisible();

    await toolButton(page, "Move").click();

    await expect(page.getByRole("button", { name: "Blue" })).toBeHidden();
  });

  test("gathers the rest of the chrome into one menu", async ({ page }) => {
    await openBoard(page);
    await page.getByRole("button", { name: "More" }).click();

    await expect(
      page.getByRole("button", { name: "Copy the link" }),
    ).toBeVisible();
    await expect(page.getByLabel("Your name")).toBeVisible();

    await page.getByRole("button", { name: "Clear the board" }).click();

    await expect(page.getByText("Board cleared for everyone")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Copy the link" }),
    ).toBeHidden();
  });
});
