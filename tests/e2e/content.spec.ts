import { expect, test } from "@playwright/test";
import {
  drag,
  inkPixels,
  openBoard,
  pictureCount,
  rotations,
  textValues,
  toolButton,
} from "./support/board";

const SAMPLE_PNG = "tests/e2e/fixtures/sample.png";

test.describe("text", () => {
  test.beforeEach(async ({ page }) => {
    await openBoard(page);
    await toolButton(page, "Text").click();
  });

  test("a click places a box that takes typing", async ({ page }) => {
    await page.mouse.click(300, 220);
    await page.keyboard.type("board notes");

    await expect.poll(() => textValues(page)).toContain("board notes");
  });

  test("the box grows to fit what is in it", async ({ page }) => {
    await page.mouse.click(300, 220);
    await page.keyboard.type("board notes");

    await expect(page.locator("textarea").first()).toHaveAttribute(
      "style",
      /height:\s*\d+px/,
    );
  });

  test("a box with something in it survives losing focus", async ({ page }) => {
    await page.mouse.click(300, 220);
    await page.keyboard.type("board notes");
    await toolButton(page, "Move").click();

    await expect(page.locator("textarea")).toHaveCount(1);
  });

  test("a box placed by a stray click is discarded on blur", async ({
    page,
  }) => {
    await page.mouse.click(300, 220);
    await page.keyboard.type("board notes");
    await page.mouse.click(900, 600);
    await expect(page.locator("textarea")).toHaveCount(2);

    await toolButton(page, "Move").click();

    await expect(page.locator("textarea")).toHaveCount(1);
  });
});

test.describe("images", () => {
  test.beforeEach(async ({ page }) => {
    await openBoard(page);
  });

  test("an imported picture lands on the board", async ({ page }) => {
    await page.setInputFiles('input[type="file"]', SAMPLE_PNG);

    await expect.poll(() => pictureCount(page)).toBe(1);
  });

  test("importing switches to the tool that can move it", async ({ page }) => {
    await page.setInputFiles('input[type="file"]', SAMPLE_PNG);

    await expect(page.locator("body")).toContainText("drag to move");
  });

  test("the picture it just placed is the one being handled", async ({
    page,
  }) => {
    await page.setInputFiles('input[type="file"]', SAMPLE_PNG);

    await expect(page.getByRole("button", { name: "Remove" })).toHaveCount(1);
  });

  test("a picture can be removed once it is placed", async ({ page }) => {
    await page.setInputFiles('input[type="file"]', SAMPLE_PNG);
    await expect.poll(() => pictureCount(page)).toBe(1);

    await page.getByRole("button", { name: "Remove" }).click();

    await expect.poll(() => pictureCount(page)).toBe(0);
  });

  test("removing is undoable like anything else", async ({ page }) => {
    await page.setInputFiles('input[type="file"]', SAMPLE_PNG);
    await expect.poll(() => pictureCount(page)).toBe(1);
    await page.getByRole("button", { name: "Remove" }).click();
    await expect.poll(() => pictureCount(page)).toBe(0);

    await page.getByRole("button", { name: "Undo" }).click();

    await expect.poll(() => pictureCount(page)).toBe(1);
  });

  test("the delete key removes the picture in hand", async ({ page }) => {
    await page.setInputFiles('input[type="file"]', SAMPLE_PNG);
    await expect.poll(() => pictureCount(page)).toBe(1);

    await page.keyboard.press("Backspace");

    await expect.poll(() => pictureCount(page)).toBe(0);
  });

  test("nothing is in hand after a click on bare board", async ({ page }) => {
    await page.setInputFiles('input[type="file"]', SAMPLE_PNG);
    await expect(page.getByRole("button", { name: "Remove" })).toHaveCount(1);

    await page.mouse.click(900, 620);

    await expect(page.getByRole("button", { name: "Remove" })).toHaveCount(0);
  });

  test("a picture turns with its rotate handle", async ({ page }) => {
    await page.setInputFiles('input[type="file"]', SAMPLE_PNG);
    const handle = page.locator("div[title='Rotate']");
    const box = await handle.boundingBox();
    if (!box) throw new Error("no rotate handle to drag");

    await drag(
      page,
      [box.x + box.width / 2, box.y + box.height / 2],
      [box.x + 220, box.y + 220],
    );

    // An unrotated element carries no transform at all, so one entry is the assertion.
    await expect.poll(() => rotations(page)).toHaveLength(1);
  });
});

test("a board is still there after a reload", async ({ page }) => {
  await openBoard(page);
  await drag(page, [420, 420], [760, 300]);
  await toolButton(page, "Text").click();
  await page.mouse.click(300, 220);
  await page.keyboard.type("board notes");
  await expect.poll(() => textValues(page)).toContain("board notes");

  await page.reload();
  await page.getByRole("button", { name: "Start drawing" }).click();

  await expect.poll(() => textValues(page)).toContain("board notes");
  await expect.poll(() => inkPixels(page)).toBeGreaterThan(0);
});
