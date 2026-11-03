import { test, expect } from "@playwright/test";
test("catalog filtering, cart and responsive layout", async ({ page }) => {
  await page.goto("http://127.0.0.1:3000");
  await expect(
    page.getByRole("heading", { name: "Dışarıda güzel bir hayat." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sandalyeler", exact: true }).click();
  await expect(page.locator(".product")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Terra Örgü Sandalye sepete ekle" })
    .click();
  await page.getByRole("button", { name: "Sepet 1", exact: true }).click();
  await expect(
    page.getByText("Demo ödeme — gerçek para çekilmez"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Kapat", exact: true }).click();
  await page.screenshot({ path: "/tmp/bahceni-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".product")).toBeVisible();
  const widths = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    innerWidth,
  ]);
  expect(widths[0]).toBeLessThanOrEqual(widths[1]);
  await page.screenshot({ path: "/tmp/bahceni-mobile.png", fullPage: true });
});
test("3D scene renders and rotation works", async ({ page }) => {
  await page.goto("http://127.0.0.1:3000");
  await page
    .locator(".product")
    .first()
    .getByRole("button", { name: "Bahçemde gör" })
    .click();
  await expect(page.locator("canvas")).toBeVisible();
  await page.locator("input[type=range]").nth(1).fill("90");
  await expect(page.getByText("Döndürme · 90°")).toBeVisible();
  await page.screenshot({ path: "/tmp/bahceni-studio.png" });
});

test("registration, photo upload, saved layout and demo checkout", async ({
  page,
}) => {
  const email = "browser-" + Date.now() + "@test.example";
  await page.goto("http://127.0.0.1:3000");
  await page.locator(".account").click();
  await page.getByRole("button", { name: "Hesabın yok mu? Üye ol" }).click();
  await page.getByLabel("Ad soyad").fill("Tarayıcı Testi");
  await page.getByLabel("E-posta", { exact: true }).fill(email);
  await page.getByLabel("Şifre", { exact: true }).fill("BrowserPass123!");
  await page
    .getByRole("button", { name: "Hesap oluştur", exact: true })
    .click();
  await expect(
    page.locator(".account"),
  ).toBeVisible();
  await page
    .locator(".product")
    .first()
    .getByRole("button", { name: "Bahçemde gör" })
    .click();
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "garden.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
        "base64",
      ),
    });
  await expect(page.locator(".scene")).toHaveCSS("background-image", /blob:/);
  await page.getByRole("button", { name: "Yerleşimimi kaydet" }).click();
  await expect(page.getByRole("button", { name: "Bahçem ↗" })).toBeVisible();
  await page.getByRole("button", { name: "Kapat", exact: true }).click();
  await page
    .locator(".product")
    .first()
    .getByRole("button", { name: /sepete ekle/ })
    .click();
  await page.locator(".cart-btn").click();
  await page
    .getByLabel("Teslimat adresi")
    .fill("Test Mahallesi, Test Sokak 123, İstanbul");
  await page.getByRole("button", { name: "Demo ödemeyi tamamla" }).click();
  await expect(
    page.getByRole("heading", { name: "Siparişlerim" }),
  ).toBeVisible();
  await expect(page.locator(".order .badge")).toHaveText("Demo ödeme");
});
