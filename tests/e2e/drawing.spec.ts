import { expect, test } from "@playwright/test";
import {
  drag,
  inkPixels,
  openBoard,
  toolButton,
  zoomLabel,
} from "./support/board";

test.describe("the drawing surface", () => {
  test.beforeEach(async ({ page }) => {
    await openBoard(page);
  });

  test("starts blank", async ({ page }) => {
    expect(await inkPixels(page)).toBe(0);
  });

  test("the pen leaves ink", async ({ page }) => {
    await drag(page, [420, 420], [760, 300]);

    expect(await inkPixels(page)).toBeGreaterThan(0);
  });

  test("a shape adds to what is already there", async ({ page }) => {
    await drag(page, [420, 420], [760, 300]);
    const drawn = await inkPixels(page);

    await toolButton(page, "Shape").click();
    await expect(toolButton(page, "Rectangle")).toBeVisible();
    await toolButton(page, "Ellipse").click();
    await drag(page, [300, 500], [520, 640]);

    expect(await inkPixels(page)).toBeGreaterThan(drawn);
  });

  test("undo takes back the last gesture and no more", async ({ page }) => {
    await drag(page, [420, 420], [760, 300]);
    const afterPen = await inkPixels(page);

    await toolButton(page, "Shape").click();
    await drag(page, [300, 500], [520, 640]);
    const afterShape = await inkPixels(page);

    await page.getByRole("button", { name: "Undo" }).click();
    await expect.poll(() => inkPixels(page)).toBeLessThan(afterShape);

    const afterUndo = await inkPixels(page);
    expect(afterUndo).toBeGreaterThan(0);
    expect(Math.abs(afterUndo - afterPen)).toBeLessThan(afterPen * 0.1);
  });

  test("redo puts back what undo took", async ({ page }) => {
    await drag(page, [420, 420], [760, 300]);
    const drawn = await inkPixels(page);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect.poll(() => inkPixels(page)).toBe(0);

    await page.getByRole("button", { name: "Redo" }).click();

    await expect.poll(() => inkPixels(page)).toBe(drawn);
  });

  test("the keyboard undoes and redoes too", async ({ page }) => {
    await drag(page, [420, 420], [760, 300]);
    const drawn = await inkPixels(page);

    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(() => inkPixels(page)).toBe(0);

    await page.keyboard.press("ControlOrMeta+Shift+z");

    await expect.poll(() => inkPixels(page)).toBe(drawn);
  });

  test("redo with nothing to redo says so", async ({ page }) => {
    await page.getByRole("button", { name: "Redo" }).click();

    await expect(page.getByText("Nothing to redo")).toBeVisible();
  });

  test("the eraser removes ink rather than painting over it", async ({
    page,
  }) => {
    await drag(page, [430, 415], [740, 300]);
    const drawn = await inkPixels(page);

    await toolButton(page, "Erase").click();
    await drag(page, [430, 415], [740, 300]);

    expect(await inkPixels(page)).toBeLessThan(drawn);
  });

  test("clear empties the board", async ({ page }) => {
    await drag(page, [420, 420], [760, 300]);
    expect(await inkPixels(page)).toBeGreaterThan(0);

    await page.getByRole("button", { name: "Clear" }).click();

    await expect.poll(() => inkPixels(page)).toBe(0);
  });

  test("a keyboard shortcut switches tool", async ({ page }) => {
    await page.keyboard.press("t");

    await expect(page.locator("body")).toContainText(
      "click anywhere to place text",
    );
  });
});

test.describe("zoom", () => {
  test.beforeEach(async ({ page }) => {
    await openBoard(page);
  });

  test("starts at life size", async ({ page }) => {
    await expect(zoomLabel(page)).toHaveText("100%");
  });

  test("zooms in and back out", async ({ page }) => {
    await page.locator("button[title='Zoom in']").click();
    await expect(zoomLabel(page)).toHaveText("120%");

    await page.locator("button[title='Zoom out']").click();
    await expect(zoomLabel(page)).toHaveText("100%");
  });

  test("resets from wherever it is", async ({ page }) => {
    await page.locator("button[title='Zoom in']").click();
    await page.locator("button[title='Zoom in']").click();
    await expect(zoomLabel(page)).not.toHaveText("100%");

    await zoomLabel(page).click();

    await expect(zoomLabel(page)).toHaveText("100%");
  });
});
