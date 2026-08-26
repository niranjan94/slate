import { test } from "@playwright/test";
import { openBoard, toolButton } from "../e2e/support/board";
const SHOT = "/private/tmp/claude-501/-Users-niranjan-projects-niranjan94-slate/1cff994b-20ce-40f2-b2d7-ebe6658b041a/scratchpad";

test("phone board", async ({ page }) => {
  await openBoard(page);
  await page.screenshot({ path: `${SHOT}/m1-pen.png` });
  const report = await page.evaluate(() => {
    const out: string[] = [];
    for (const b of Array.from(document.querySelectorAll("button"))) {
      const r = b.getBoundingClientRect();
      if (r.width === 0) continue;
      const label = (b.getAttribute("aria-label") || b.textContent || "?").trim().slice(0, 16);
      const on = r.left >= -0.5 && r.right <= window.innerWidth + 0.5 && r.top >= 0 && r.bottom <= window.innerHeight;
      out.push(`${on ? "ON " : "OFF"} ${Math.round(r.width)}x${Math.round(r.height)} @${Math.round(r.left)},${Math.round(r.top)} ${label}`);
    }
    return { w: window.innerWidth, h: window.innerHeight, out };
  });
  console.log("W", report.w, "H", report.h);
  for (const line of report.out) console.log("  " + line);

  await toolButton(page, "Shape").click();
  await page.screenshot({ path: `${SHOT}/m2-shape.png` });
  await toolButton(page, "Move").click();
  await page.screenshot({ path: `${SHOT}/m3-move.png` });
  await page.getByRole("button", { name: "More" }).click();
  await page.screenshot({ path: `${SHOT}/m4-menu.png` });
});
