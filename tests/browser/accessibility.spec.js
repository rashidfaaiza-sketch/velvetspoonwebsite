import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("main pages have no serious WCAG AA accessibility violations or horizontal overflow", async ({
  page,
}) => {
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of [
      "/",
      "/menu",
      "/product/tres-leches",
      "/custom-cake",
      "/admin",
    ]) {
      await page.goto(route);
      await expect(page.locator("h1")).toBeVisible();
      await page.emulateMedia({ reducedMotion: "reduce" });
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(
        result.violations,
        `${width}px ${route}: ${JSON.stringify(result.violations.map((x) => ({ id: x.id, nodes: x.nodes.map((n) => n.target) })))}`,
      ).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${width}px ${route} overflow`,
      ).toBeTruthy();
    }
  }
});
test("development server blocks database and environment paths", async ({
  request,
}) => {
  for (const path of [
    "/data/velvet.sqlite",
    "/data/application.key",
    "/.env.example",
  ]) {
    const r = await request.get(path);
    expect([403, 404]).toContain(r.status());
  }
});
