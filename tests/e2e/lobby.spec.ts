import { expect, test } from "@playwright/test";
import { createBoard } from "./support/board";

test.describe("lobby", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("offers a new board", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: "Start a new board" }),
    ).toBeVisible();
  });

  test("credits the transport it actually uses", async ({ page }) => {
    await expect(
      page.getByText("Powered by Trystero and WebRTC."),
    ).toBeVisible();
  });

  test("links to the source", async ({ page }) => {
    await expect(page.getByRole("link", { name: "Source" })).toHaveAttribute(
      "href",
      "https://github.com/niranjan94/slate",
    );
  });

  test("does not claim boards are stored nowhere", async ({ page }) => {
    await expect(page.locator("body")).not.toContainText(
      "nothing is stored on a server",
    );
  });

  test("refuses a code that is too short", async ({ page }) => {
    await page.getByLabel("Board code").fill("AB");
    await page.getByRole("button", { name: "Join" }).click();

    await expect(page.getByText("Board codes are 5 characters")).toBeVisible();
    await expect(page).toHaveURL("/");
  });

  test("uppercases a code as it is typed", async ({ page }) => {
    await page.getByLabel("Board code").fill("qw3rt");

    await expect(page.getByLabel("Board code")).toHaveValue("QW3RT");
  });

  test("starting a board routes to it", async ({ page }) => {
    const code = await createBoard(page);

    expect(code).toMatch(/^[A-Z0-9]{5}$/);
  });

  test("a code typed in lowercase reaches the same board", async ({ page }) => {
    const code = await createBoard(page);

    await page.goto("/");
    await page.getByLabel("Board code").fill(code.toLowerCase());
    await page.getByRole("button", { name: "Join" }).click();

    await expect(page).toHaveURL(`/b/${code}`);
  });
});

test("a malformed room code is not a board", async ({ page }) => {
  const response = await page.goto("/b/ZZ");

  expect(response?.status()).toBe(404);
});
