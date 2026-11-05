import { test, expect } from "@playwright/test";
import path from "node:path";
for (const width of [390, 1440])
  test(`storefront responsive ordering at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: /Homemade happiness/ }),
    ).toBeVisible();
    await expect(page.getByText("PREVIEW · Demo checkout.")).toBeVisible();
    await expect(page.locator(".hero-photo")).toHaveJSProperty(
      "complete",
      true,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await expect(page.locator(".hero-copy h1")).toHaveCSS("opacity", "1");
    await page.screenshot({
      path: path.resolve(
        `docs/preview-${width === 390 ? "mobile" : "desktop"}.png`,
      ),
      fullPage: true,
    });
    if (width === 390) {
      await page.getByRole("button", { name: "Open menu" }).click();
      await expect(
        page.getByRole("navigation", { name: "Main navigation" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Close menu" }).click();
    }
    await page.getByRole("link", { name: "Order Now", exact: true }).click();
    await page.getByRole("button", { name: "Cookies", exact: true }).click();
    await expect(page.getByText("Still in the mixing bowl.")).toBeVisible();
    await page.getByRole("button", { name: "All treats", exact: true }).click();
    await page
      .getByRole("heading", { name: "The Velvet Tres Leches" })
      .getByRole("link")
      .click();
    await page.getByLabel("Choose a portion").selectOption("Sharing");
    await page.getByLabel("A little message?").fill("Happy birthday");
    await expect(
      page.getByRole("button", { name: "Add to bag · ₹860" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Add to bag · ₹860" }).click();
    await page.getByRole("link", { name: "Shopping bag, 1 items" }).click();
    await expect(page.getByText("₹860", { exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "Continue to checkout" }).click();
    await page
      .getByLabel("Preferred fulfilment date")
      .selectOption({ index: 1 });
    await page.getByLabel("Your name", { exact: true }).fill("Browser Test");
    await page.getByLabel("Mobile number").fill("123");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Review your order" }).click();
    await expect(
      page.getByRole("heading", { name: "Your details", exact: true }),
    ).toBeVisible();
    await page.getByLabel("Mobile number").fill("9876543210");
    await page.getByRole("button", { name: "Review your order" }).click();
    await expect(
      page.getByRole("heading", { name: "One last little look." }),
    ).toBeVisible();
    await expect(page.getByText("₹860", { exact: true }).first()).toBeVisible();
    await page
      .getByRole("button", { name: "Continue to demo checkout" })
      .click();
    await expect(
      page.getByRole("heading", { name: "A little preview of happiness." }),
    ).toBeVisible();
    await expect(page.getByText("demo unpaid", { exact: true })).toBeVisible();
    await page
      .getByRole("button", { name: "Try demo checkout (no payment)" })
      .click();
    await expect(
      page.getByText("Demo checkout complete. No payment has been taken"),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    expect(errors).toEqual([]);
  });
test("custom enquiry, policy drafts and secure administrator boundary", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/custom-cake");
  await page.getByLabel("The occasion").fill("Birthday");
  await page.getByLabel("How many servings?").fill("12");
  await page.getByLabel("Flavour you’re dreaming of").fill("Chocolate");
  await page.getByLabel("Your budget").fill("1500");
  const catalog = await (await page.request.get("/api/catalog")).json();
  await page.getByLabel("Required date").fill(catalog.latest);
  await page.getByLabel("Your name", { exact: true }).fill("Enquiry Test");
  await page.getByLabel("Your mobile number").fill("9876543210");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Send a little inspiration" }).click();
  await expect(
    page.getByRole("heading", { name: "Your idea is in good hands." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "View your enquiry" }).click();
  await expect(page.getByText("Awaiting the baker’s review.")).toBeVisible();
  await page.goto("/policies/refund");
  await expect(
    page.getByText("DRAFT · REQUIRES BUSINESS & LEGAL REVIEW"),
  ).toBeVisible();
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  await page
    .getByLabel("Password", { exact: true })
    .fill("not-a-valid-password");
  await page.getByRole("button", { name: "Step into the kitchen" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "A little kitchen control." }),
  ).toHaveCount(0);
});
