import { expect } from "@playwright/test";

/** Clave de sesión del cliente web (packages/shared SESSION_STORAGE_KEY). */
export const SESSION_STORAGE_KEY = "cryptarch_session";

export const DEV_TENANT = "00000000-0000-4000-8000-000000000001";
export const DEV_EMAIL = "admin@dev.local";
export const DEV_PASSWORD = "admin";

export const API_BASE_URL =
  process.env.VITE_API_BASE_URL || "http://localhost:8000";

/**
 * Login de administrador de desarrollo y espera al workspace de usuarios.
 * @param {import("@playwright/test").Page} page
 */
export async function devLogin(page) {
  await page.goto("/login");
  await page.getByLabel("Tenant ID").fill(DEV_TENANT);
  await page.getByLabel("Email").fill(DEV_EMAIL);
  await page.getByLabel("Password").fill(DEV_PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/admin\/users/);
}

/**
 * Lee el JWT de sesión desde localStorage.
 * @param {import("@playwright/test").Page} page
 * @returns {Promise<string|null>}
 */
export async function getSessionToken(page) {
  const raw = await page.evaluate(
    (key) => localStorage.getItem(key),
    SESSION_STORAGE_KEY,
  );
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed?.token ?? null;
  } catch {
    return null;
  }
}

/**
 * DELETE autenticado contra la API (limpieza e2e). No lanza si falla.
 * @param {import("@playwright/test").Page} page
 * @param {string} path
 * @returns {Promise<{ ok: boolean, status: number }>}
 */
export async function apiDelete(page, path) {
  try {
    const token = await getSessionToken(page);
    if (!token) return { ok: false, status: 0 };
    const response = await page.request.delete(`${API_BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return { ok: response.ok(), status: response.status() };
  } catch {
    return { ok: false, status: 0 };
  }
}

/**
 * GET autenticado contra la API.
 * @param {import("@playwright/test").Page} page
 * @param {string} path
 * @returns {Promise<{ ok: boolean, status: number, json: unknown }>}
 */
export async function apiGet(page, path) {
  try {
    const token = await getSessionToken(page);
    if (!token) return { ok: false, status: 0, json: null };
    const response = await page.request.get(`${API_BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    let json = null;
    try {
      json = await response.json();
    } catch {
      json = null;
    }
    return { ok: response.ok(), status: response.status(), json };
  } catch {
    return { ok: false, status: 0, json: null };
  }
}
