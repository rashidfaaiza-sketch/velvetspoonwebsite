import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { passwordHash, addDays, todayIndia } from "../../server/domain.js";
let child, directory;
const origin = "http://127.0.0.1:3101";
test.beforeAll(async () => {
  directory = mkdtempSync(path.join(os.tmpdir(), "velvet-browser-"));
  child = spawn(process.execPath, ["server/index.js"], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      PAYMENT_MODE: "demo",
      HOST: "127.0.0.1",
      PORT: "3101",
      APP_ORIGIN: origin,
      DATA_DIR: directory,
      ADMIN_USERNAME: "baker",
      ADMIN_PASSWORD_HASH: passwordHash("temporary-browser-test-password"),
      SESSION_SECRET: "temporary-browser-tests-session-secret-123456789",
    },
    stdio: "ignore",
  });
  await expect
    .poll(
      async () => {
        try {
          return (await fetch(origin + "/api/health")).status;
        } catch {
          return 0;
        }
      },
      { timeout: 20000 },
    )
    .toBe(200);
});
test.afterAll(async () => {
  if (child) {
    child.kill("SIGTERM");
    await new Promise((r) => child.once("exit", r));
  }
  if (directory) rmSync(directory, { recursive: true, force: true });
});
test("administrator can edit products/settings and review a custom quote in the browser", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(origin + "/admin");
  await page
    .getByLabel("Password", { exact: true })
    .fill("temporary-browser-test-password");
  await page.getByRole("button", { name: "Step into the kitchen" }).click();
  await expect(
    page.getByRole("heading", { name: "A little kitchen control." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Products", exact: true }).click();
  await page.getByRole("button", { name: "Add a treat" }).click();
  await page.getByLabel("Product ID", { exact: true }).fill("test-cookie");
  await page
    .getByLabel("Name", { exact: true })
    .fill("Demo cookie for testing");
  await page.getByLabel("Category").selectOption("Cookies");
  await page.getByLabel("Base price").fill("123");
  await page
    .getByLabel("Verified ingredients")
    .fill("Test wheat flour and butter");
  await page
    .getByLabel("Verified allergen")
    .fill("Test allergens: wheat, milk");
  await page.getByLabel("Visible on menu").check();
  await page
    .getByLabel("Upload product photo")
    .setInputFiles(path.resolve("public/images/hero.png"));
  await expect(page.getByText(/Image: \/media\//)).toBeVisible();
  await page.getByRole("button", { name: "Save product" }).click();
  await expect(
    page.getByRole("heading", { name: "Demo cookie for testing" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Preparation lead time").fill("3");
  await page.getByLabel("Daily capacity").fill("12");
  await page.getByRole("button", { name: "Save kitchen settings" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");
  const catalog = await (await request.get(origin + "/api/catalog")).json();
  expect(catalog.settings.leadDays).toBe(3);
  expect(catalog.products.find((p) => p.id === "test-cookie").price).toBe(
    12300,
  );
  const date = addDays(todayIndia(), 6),
    response = await request.post(origin + "/api/enquiries", {
      multipart: {
        occasion: "Preview birthday",
        servings: "10",
        flavour: "Chocolate",
        budget: "1500",
        date,
        message: "Demo enquiry, not a real order",
        name: "Dashboard Demo",
        phone: "9876543210",
        email: "",
      },
    });
  expect(response.status()).toBe(201);
  const enquiry = await response.json();
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await page.getByRole("button", { name: "Enquiries", exact: true }).click();
  await page.getByRole("button", { name: "Review & prepare a quote" }).click();
  await page
    .getByLabel("Agreed design")
    .fill("A demo chocolate cake with pink flowers, details for testing only.");
  await page.getByLabel("Cake price").fill("1500");
  await page.getByLabel("Deposit or full").fill("500");
  await page.getByRole("button", { name: "Save reviewed quote" }).click();
  await expect(page.getByText("Quoted ₹1,500 · Deposit ₹500")).toBeVisible();
  await page.screenshot({
    path: path.resolve("docs/preview-dashboard.png"),
    fullPage: true,
  });
  await page.goto(origin + "/quote#" + enquiry.token);
  await expect(page.getByText("₹500", { exact: true })).toBeVisible();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Accept quote & continue" }).click();
  await expect(
    page.getByRole("heading", { name: "A little preview of happiness." }),
  ).toBeVisible();
  await expect(page.getByText("Deposit requested now: ₹500.")).toBeVisible();
  await page.goto(origin + "/admin");
  await page.getByRole("button", { name: "Orders", exact: true }).click();
  await page.getByLabel("Stage for Dashboard Demo").selectOption("baking");
  await expect(page.getByText("Payment: demo_unpaid")).toBeVisible();
  await expect(page.getByText("Fulfilment: baking")).toBeVisible();
});
