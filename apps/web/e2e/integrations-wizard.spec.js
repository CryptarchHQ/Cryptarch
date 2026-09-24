import { test, expect } from "@playwright/test";
import { apiDelete, apiGet, devLogin } from "./helpers.js";

function isJsonCreatePost(response, resourcePath) {
  if (response.request().method() !== "POST") return false;
  let pathname;
  try {
    pathname = new URL(response.url()).pathname;
  } catch {
    return false;
  }
  return pathname === resourcePath || pathname.endsWith(resourcePath);
}

async function cleanupIntegration(page, { connectorId, actionId }) {
  try {
    if (actionId) {
      await apiDelete(page, `/admin/actions/${actionId}`);
    }
    if (!connectorId) return;

    let result = await apiDelete(page, `/admin/connectors/${connectorId}`);
    if (result.status !== 409) return;

    const listed = await apiGet(
      page,
      `/admin/actions?connector_id=${encodeURIComponent(connectorId)}`,
    );
    const actions = Array.isArray(listed.json)
      ? listed.json
      : Array.isArray(listed.json?.items)
        ? listed.json.items
        : [];
    for (const action of actions) {
      if (action?.id) {
        await apiDelete(page, `/admin/actions/${action.id}`);
      }
    }
    await apiDelete(page, `/admin/connectors/${connectorId}`);
  } catch {
    // limpieza best-effort
  }
}

test("OAuth2 añade pasos Revisar acceso y Probar conexión sin guardar", async ({
  page,
}) => {
  await devLogin(page);
  await page.goto("/admin/integrations/new");

  const rail = page.getByRole("navigation", { name: "Pasos" });
  await expect(rail.getByRole("button", { name: "Servicio" })).toBeVisible();
  await expect(rail.getByRole("button", { name: "Acción" })).toBeVisible();
  await expect(rail.getByRole("button", { name: "Campos" })).toBeVisible();
  await expect(rail.getByRole("button", { name: "Revisar acceso" })).toHaveCount(
    0,
  );
  await expect(
    rail.getByRole("button", { name: "Probar conexión" }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "OAuth2" }).click();
  await expect(rail.getByRole("button", { name: "Revisar acceso" })).toBeVisible();
  await expect(
    rail.getByRole("button", { name: "Probar conexión" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Sin autenticación" }).click();
  await expect(rail.getByRole("button", { name: "Revisar acceso" })).toHaveCount(
    0,
  );
  await expect(
    rail.getByRole("button", { name: "Probar conexión" }),
  ).toHaveCount(0);
});

test("alta real sin autenticación crea conector y acción", async ({ page }) => {
  let connectorId = null;
  let actionId = null;
  const uniqueName = `e2e-${Date.now()}`;

  try {
    await devLogin(page);
    await page.goto("/admin/integrations/new");

    await page.getByLabel("Nombre").fill(uniqueName);
    await page.getByLabel("URL base").fill("https://example.com");
    await page.getByRole("button", { name: "Sin autenticación" }).click();
    await page.getByRole("button", { name: "Continuar" }).click();

    await expect(page.getByRole("heading", { name: "Acción" })).toBeVisible();
    await page.getByLabel("Nombre").fill("Listar");
    await page.getByLabel("Path").fill("/v1/items");
    await page.getByRole("button", { name: "Continuar" }).click();

    await expect(page.getByRole("heading", { name: "Campos" })).toBeVisible();

    const connectorPost = page.waitForResponse(
      (response) =>
        isJsonCreatePost(response, "/admin/connectors") &&
        response.status() >= 200 &&
        response.status() < 300,
    );
    const actionPost = page.waitForResponse(
      (response) =>
        isJsonCreatePost(response, "/admin/actions") &&
        response.status() >= 200 &&
        response.status() < 300,
    );

    await page.getByRole("button", { name: "Continuar" }).click();

    const connectorResponse = await connectorPost;
    const actionResponse = await actionPost;
    expect(connectorResponse.status()).toBeGreaterThanOrEqual(200);
    expect(connectorResponse.status()).toBeLessThan(300);
    expect(actionResponse.status()).toBeGreaterThanOrEqual(200);
    expect(actionResponse.status()).toBeLessThan(300);

    try {
      const connectorBody = await connectorResponse.json();
      connectorId = connectorBody?.id ?? null;
    } catch {
      connectorId = null;
    }
    try {
      const actionBody = await actionResponse.json();
      actionId = actionBody?.id ?? null;
    } catch {
      actionId = null;
    }

    await expect(page).toHaveURL(/\/admin\/integrations\/[^/]+$/);
    if (connectorId) {
      await expect(page).toHaveURL(
        new RegExp(`/admin/integrations/${connectorId}$`),
      );
    }
  } finally {
    await cleanupIntegration(page, { connectorId, actionId });
  }
});
