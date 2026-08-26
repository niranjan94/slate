import { expect, test } from "@playwright/test";
import { createBoard, dismissGate } from "./support/board";

const nameField = (page: Parameters<typeof createBoard>[0]) =>
  page.getByPlaceholder("Type your name");

/** The rename control in the board chrome, which is a button until it is clicked. */
const youChip = (page: Parameters<typeof createBoard>[0]) =>
  page
    .locator("div")
    .filter({ hasText: /^You/ })
    .locator("button, input")
    .last();

test.describe("naming yourself", () => {
  test.beforeEach(async ({ page }) => {
    await createBoard(page);
  });

  test("the entry panel asks for your name", async ({ page }) => {
    await expect(nameField(page)).toBeVisible();
  });

  test("a name is generated so nobody is ever unlabelled", async ({ page }) => {
    await expect(nameField(page)).toHaveValue(/^[A-Z][a-z]+$/);
  });

  test("the chip in the chrome agrees with the panel", async ({ page }) => {
    const generated = await nameField(page).inputValue();
    await dismissGate(page);

    await expect(youChip(page)).toHaveText(generated);
  });

  test("a chosen name reaches the chrome", async ({ page }) => {
    await nameField(page).fill("Ada Lovelace");
    await nameField(page).press("Enter");
    await dismissGate(page);

    await expect(youChip(page)).toHaveText("Ada Lovelace");
  });

  test("the name is remembered for next time", async ({ page }) => {
    await nameField(page).fill("Ada Lovelace");
    await nameField(page).press("Enter");

    await page.reload();

    await expect(nameField(page)).toHaveValue("Ada Lovelace");
  });

  test("the name carries to a different board", async ({ page }) => {
    await nameField(page).fill("Ada Lovelace");
    await nameField(page).press("Enter");

    await createBoard(page);

    await expect(nameField(page)).toHaveValue("Ada Lovelace");
  });

  test("a name too long for a cursor label is capped", async ({ page }) => {
    await nameField(page).fill("Bartholomew Fitzgerald III");

    await expect(nameField(page)).toHaveValue("Bartholomew Fitzge");
  });

  test("the chip can be renamed mid session", async ({ page }) => {
    await nameField(page).fill("Ada");
    await nameField(page).press("Enter");
    await dismissGate(page);

    await youChip(page).click();
    await page.getByLabel("Your name").fill("Grace");
    await page.getByLabel("Your name").press("Enter");

    await expect(youChip(page)).toHaveText("Grace");
  });

  test("escape abandons a rename", async ({ page }) => {
    await nameField(page).fill("Ada");
    await nameField(page).press("Enter");
    await dismissGate(page);

    await youChip(page).click();
    await page.getByLabel("Your name").fill("Discarded");
    await page.getByLabel("Your name").press("Escape");

    await expect(youChip(page)).toHaveText("Ada");
  });

  test("clearing a chosen name hands back a generated one", async ({
    page,
  }) => {
    await nameField(page).fill("Ada Lovelace");
    await nameField(page).press("Enter");

    await nameField(page).fill("");
    await nameField(page).press("Enter");

    await expect(nameField(page)).toHaveValue(/^[A-Z][a-z]+$/);
    expect(
      await page.evaluate(() => localStorage.getItem("slate-name")),
    ).toBeNull();
  });

  // Clearing an untouched field applies the name already showing, so nothing
  // re-renders and the field has to repopulate itself rather than stay blank.
  test("clearing a name nobody changed leaves it showing", async ({ page }) => {
    const generated = await nameField(page).inputValue();

    await nameField(page).fill("");
    await nameField(page).press("Enter");

    await expect(nameField(page)).toHaveValue(generated);
  });

  test("a rename applied to the panel shows up on the chip too", async ({
    page,
  }) => {
    await dismissGate(page);
    await youChip(page).click();
    await page.getByLabel("Your name").fill("Grace");
    await page.getByLabel("Your name").press("Enter");

    await expect(youChip(page)).toHaveText("Grace");
  });
});
