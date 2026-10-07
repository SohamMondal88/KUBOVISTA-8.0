import { test, expect } from "@playwright/test";

test("image-only logos, minimal chat and responsive shell", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".hero-video-surface")).toBeVisible();
  await expect(page.locator(".hero > img")).toHaveCount(0);
  for (const width of [360, 390, 600, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    for (const selector of ["#header .brand", ".footer-wordmark"]) {
      const logo = page.locator(selector);
      await expect(logo).toHaveText("");
      expect(
        await logo
          .locator("img")
          .evaluate((img) => img.complete && img.naturalWidth > 0),
      ).toBe(true);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 740 });
  await page
    .getByRole("button", { name: "Ask Kubo, your travel companion" })
    .click();
  await expect(
    page.getByRole("heading", { name: "How can I help?" }),
  ).toBeVisible();
  await page.locator("#kubo-input").fill("Tell me about Darjeeling");
  await page.locator("#kubo-send").click();
  await expect(page.locator(".kubo-message.user")).toBeVisible();
  await expect(page.locator(".kubo-message").last()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Ask Kubo, your travel companion" }),
  ).toBeFocused();
});

test("password visibility and guidance work without submitting credentials", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#account-button").click();
  await expect(page.locator("#login-form")).toBeVisible();
  await page.locator("[data-password-toggle]").click();
  await expect(page.locator("#password-password")).toHaveAttribute(
    "type",
    "text",
  );
  await page.locator("[data-password-toggle]").click();
  await expect(page.locator("#password-password")).toHaveAttribute(
    "type",
    "password",
  );
  await page
    .getByRole("link", { name: "Create an account", exact: true })
    .click();
  await page.locator("#password-password").fill("local-only-test-passphrase");
  await expect(page.locator("meter")).toHaveAttribute("value", "4");
});
