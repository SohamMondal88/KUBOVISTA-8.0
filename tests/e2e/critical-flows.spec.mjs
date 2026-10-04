import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("home, navigation, consent and destination discovery remain usable", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Somewhere worth slowing down/i }),
  ).toBeVisible();
  await page.locator('a[href="/destinations"]:visible').first().click();
  await expect(
    page.getByRole("heading", { name: /Find your somewhere/i }),
  ).toBeVisible();
  await expect(page.locator("#india-map")).toBeVisible();
  await page.getByRole("button", { name: "Analytics preferences" }).click();
  await expect(
    page.getByRole("dialog", { name: "Analytics preferences" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  expect(errors).toEqual([]);
});

test("public pages have no serious accessibility violations", async ({
  page,
}) => {
  for (const path of ["/", "/destinations"]) {
    await page.goto(path);
    await expect(page.locator("main")).not.toBeEmpty();
    const results = await new AxeBuilder({ page })
      .exclude("#india-map")
      .analyze();
    expect(
      results.violations.filter((item) =>
        ["serious", "critical"].includes(item.impact),
      ),
    ).toEqual([]);
  }
});

test("mobile navigation and layouts do not overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toHaveClass(/open/);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Open navigation" }),
  ).toBeFocused();
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
