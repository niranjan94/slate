import { expect, test } from "@playwright/test";
import {
  openBoard,
  pictureCount,
  pictureOrigins,
  rotations,
  textValues,
  toolButton,
  zoomLabel,
} from "./support/board";

const SAMPLE_PNG = "tests/e2e/fixtures/sample.png";

test.describe("the shortcut sheet", () => {
  test.beforeEach(async ({ page }) => {
    await openBoard(page);
  });

  test("a question mark says what the keys do", async ({ page }) => {
    await page.keyboard.press("?");

    await expect(page.getByText("Keyboard shortcuts")).toBeVisible();
  });

  test("escape puts it away again", async ({ page }) => {
    await page.keyboard.press("?");
    await expect(page.getByText("Keyboard shortcuts")).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(page.getByText("Keyboard shortcuts")).toBeHidden();
  });

  test("the chrome offers the same list to a mouse", async ({ page }) => {
    await page.getByRole("button", { name: "Keyboard shortcuts" }).click();

    await expect(
      page.getByText("⌘ is Ctrl on Windows and Linux"),
    ).toBeVisible();
  });

  test("a tool key does not leak through the open sheet", async ({ page }) => {
    await page.keyboard.press("?");

    await page.keyboard.press("t");

    await expect(page.locator("body")).toContainText("drag to draw");
  });
});

test.describe("the view keys", () => {
  test.beforeEach(async ({ page }) => {
    await openBoard(page);
  });

  test("zoom in and back out", async ({ page }) => {
    await page.keyboard.press("=");
    await expect(zoomLabel(page)).toHaveText("120%");

    await page.keyboard.press("-");

    await expect(zoomLabel(page)).toHaveText("100%");
  });

  test("zero returns to life size", async ({ page }) => {
    await page.keyboard.press("=");
    await page.keyboard.press("=");
    await expect(zoomLabel(page)).not.toHaveText("100%");

    await page.keyboard.press("0");

    await expect(zoomLabel(page)).toHaveText("100%");
  });
});

test.describe("the keys for what is in hand", () => {
  test.beforeEach(async ({ page }) => {
    await openBoard(page);
    await page.setInputFiles('input[type="file"]', SAMPLE_PNG);
    await expect.poll(() => pictureCount(page)).toBe(1);
  });

  test("an arrow nudges it a pixel and shift nudges it ten", async ({
    page,
  }) => {
    const [[left, top]] = await pictureOrigins(page);

    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Shift+ArrowDown");

    await expect
      .poll(() => pictureOrigins(page))
      .toEqual([
        [
          `${Number.parseFloat(left) + 2}px`,
          `${Number.parseFloat(top) + 10}px`,
        ],
      ]);
  });

  test("a bracket turns it", async ({ page }) => {
    await page.keyboard.press("]");

    // An unrotated element carries no transform at all, so one entry is the assertion.
    await expect.poll(() => rotations(page)).toHaveLength(1);
  });

  test("a duplicate lands beside the original", async ({ page }) => {
    await page.keyboard.press("ControlOrMeta+d");
    await expect.poll(() => pictureCount(page)).toBe(2);

    const [original, copy] = await pictureOrigins(page);

    expect(Number.parseFloat(copy[0])).toBe(
      Number.parseFloat(original[0]) + 28,
    );
  });

  test("nothing answers the keys once it is put down", async ({ page }) => {
    const origins = await pictureOrigins(page);

    await page.keyboard.press("Escape");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("]");

    expect(await pictureOrigins(page)).toEqual(origins);
    expect(await rotations(page)).toHaveLength(0);
  });
});

test("enter opens a duplicated text box for typing", async ({ page }) => {
  await openBoard(page);
  await toolButton(page, "Text").click();
  await page.mouse.click(300, 220);
  await page.keyboard.type("notes");
  await toolButton(page, "Move").click();
  await page.mouse.click(300, 220);

  await page.keyboard.press("ControlOrMeta+d");
  await expect(page.locator("textarea")).toHaveCount(2);

  await page.keyboard.press("Enter");
  await page.keyboard.type("!");

  await expect.poll(() => textValues(page)).toContain("notes!");
});
