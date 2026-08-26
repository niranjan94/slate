import { expect, test } from "@playwright/test";
import {
  drag,
  inkPixels,
  openBoard,
  pictureCount,
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
