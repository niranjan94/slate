import { expect, test } from "@playwright/test";
import { openBoard, pictureCount } from "./support/board";

/**
 * WebKit encodes no webp, and asking it for one returns png, so an import that trusts
 * the requested format silently keeps the camera original instead of the downscale.
 * The rest of the suite is Chromium, where webp works and this cannot be caught.
 */
test("an oversized picture is downscaled on an engine without webp", async ({
  page,
}) => {
  await openBoard(page);

  // Noise resists compression the way a photograph does, so the original stays large.
  const originalLength = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 3000;
    canvas.height = 2250;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    const pixels = ctx.createImageData(canvas.width, canvas.height);
    for (let i = 0; i < pixels.data.length; i += 4) {
      pixels.data[i] = Math.random() * 256;
      pixels.data[i + 1] = Math.random() * 256;
      pixels.data[i + 2] = Math.random() * 256;
      pixels.data[i + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
    const original = canvas.toDataURL("image/jpeg", 0.92);

    const blob = await (await fetch(original)).blob();
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], "camera.jpg", { type: "image/jpeg" }));
    const input =
      document.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error("no file input");
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return original.length;
  });

  await expect.poll(() => pictureCount(page), { timeout: 30_000 }).toBe(1);

  const placed = await page
    .locator("div")
    .evaluateAll(
      (nodes) =>
        nodes
          .map((node) => (node as HTMLElement).style.backgroundImage)
          .find((value) => value.startsWith('url("data:image')) ?? "",
    );

  expect(originalLength).toBeGreaterThan(1_600_000);
  expect(placed).not.toContain("data:image/png");
  expect(placed.length).toBeLessThan(originalLength / 2);
});
