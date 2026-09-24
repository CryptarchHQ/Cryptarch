import { test, expect } from "@playwright/test";
import { devLogin } from "./helpers.js";

test("admin login reaches users workspace", async ({ page }) => {
  await devLogin(page);
  await expect(page.getByRole("heading", { name: "Usuarios" })).toBeVisible();
});

test("admin navigates to integrations", async ({ page }) => {
  await devLogin(page);
  await page.getByRole("link", { name: "Integraciones" }).click();
  await expect(page).toHaveURL(/\/admin\/integrations/);
  await expect(
    page.getByRole("heading", { name: "Integraciones" }),
  ).toBeVisible();
});

test("chat assistant page loads after login", async ({ page }) => {
  await devLogin(page);
  await page.getByRole("link", { name: "Chat" }).click();
  await expect(page).toHaveURL(/\/chat/);
  await expect(page.getByRole("heading", { name: "Asistente" })).toBeVisible();
});
