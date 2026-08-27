import { expect, type Page } from "@playwright/test";

export type Point = [number, number];

/** Counts non transparent canvas pixels, which is the only honest way to assert ink landed. */
export async function inkPixels(page: Page): Promise<number> {
  return page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    if (!canvas) return -1;
    const context = canvas.getContext("2d");
    if (!context) return -1;
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let lit = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) lit += 1;
    return lit;
  });
}

export async function drag(
  page: Page,
  [fromX, fromY]: Point,
  [toX, toY]: Point,
  steps = 18,
): Promise<void> {
  await page.mouse.move(fromX, fromY);
  await page.mouse.down();
  for (let step = 1; step <= steps; step += 1) {
    await page.mouse.move(
      fromX + ((toX - fromX) * step) / steps,
      fromY + ((toY - fromY) * step) / steps,
    );
  }
  await page.mouse.up();
}

export async function createBoard(page: Page): Promise<string> {
  await page.goto("/");
  await page.getByRole("button", { name: "Start a new board" }).click();
  await page.waitForURL(/\/b\/[A-Z0-9]{5}$/);
  return page.url().split("/b/")[1];
}

/**
 * The entry panel does not wait for a peer, so a solo test can dismiss it
 * without depending on the relay network being reachable.
 */
export async function dismissGate(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Start drawing" }).click();
  await expect(
    page.getByRole("button", { name: "Start drawing" }),
  ).toBeHidden();
}

export async function openBoard(page: Page): Promise<string> {
  const code = await createBoard(page);
  await dismissGate(page);
  return code;
}

export const textValues = (page: Page) =>
  page
    .locator("textarea")
    .evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLTextAreaElement).value),
    );

export const zoomLabel = (page: Page) =>
  page.locator("button[title='Reset view']");

export const toolButton = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });

/** Board pictures are a div with an inline background image, so they are counted that way. */
export const pictureCount = (page: Page) =>
  page
    .locator("div")
    .evaluateAll(
      (nodes) =>
        nodes.filter((node) =>
          (node as HTMLElement).style.backgroundImage.startsWith(
            'url("data:image',
          ),
        ).length,
    );

/** Element wrappers carry their rotation as an inline transform, so that is what is read. */
export const rotations = (page: Page) =>
  page
    .locator("div")
    .evaluateAll((nodes) =>
      nodes
        .map((node) => (node as HTMLElement).style.transform)
        .filter((transform) => transform.startsWith("rotate")),
    );

/** The wrapper around a picture carries its world position as an inline left and top. */
export const pictureOrigins = (page: Page) =>
  page.locator("div").evaluateAll((nodes) =>
    nodes
      .filter((node) =>
        (node as HTMLElement).style.backgroundImage.startsWith(
          'url("data:image',
        ),
      )
      .map((node) => {
        const wrapper = node.parentElement as HTMLElement;
        return [wrapper.style.left, wrapper.style.top];
      }),
  );
