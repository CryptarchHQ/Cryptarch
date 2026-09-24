import { test, expect } from "@playwright/test";
import { apiDelete, devLogin } from "./helpers.js";

function isDocumentsListGet(response) {
  if (response.request().method() !== "GET") return false;
  let pathname;
  try {
    pathname = new URL(response.url()).pathname;
  } catch {
    return false;
  }
  return pathname === "/admin/documents" || pathname.endsWith("/admin/documents");
}

function isDocumentsUploadPost(response) {
  if (response.request().method() !== "POST") return false;
  return response.url().includes("/admin/documents/upload");
}

test("documents library: list, upload txt, reject exe", async ({ page }) => {
  let createdDocumentId = null;

  try {
    await devLogin(page);

    const listResponsePromise = page.waitForResponse(
      (response) => isDocumentsListGet(response) && response.status() >= 200 && response.status() < 300,
    );
    await page.getByRole("link", { name: "Documentos" }).click();
    await listResponsePromise;

    await expect(page.getByRole("heading", { name: "Documentos" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Añadir documento" }),
    ).toHaveCount(1);
    await expect(
      page.getByRole("button", { name: "Elegir fichero" }),
    ).toHaveCount(0);
    await expect(page.getByText("Arrastra documentos aquí")).toBeVisible();

    const fileName = `e2e-${Date.now()}.txt`;
    await page.getByLabel("Seleccionar fichero").setInputFiles({
      name: fileName,
      mimeType: "text/plain",
      buffer: Buffer.from("contenido e2e de prueba\n"),
    });

    await expect(page.getByLabel("Título")).toHaveValue(fileName);

    const uploadResponsePromise = page.waitForResponse(isDocumentsUploadPost);
    await page.getByRole("button", { name: "Confirmar" }).click();
    const uploadResponse = await uploadResponsePromise;
    expect(uploadResponse.status()).toBe(201);

    try {
      const body = await uploadResponse.json();
      createdDocumentId = body?.id ?? null;
    } catch {
      createdDocumentId = null;
    }

    await expect(
      page.getByRole("status").filter({ hasText: "Documento en cola" }),
    ).toBeVisible();

    await page.getByLabel("Seleccionar fichero").setInputFiles({
      name: "malware.exe",
      mimeType: "application/octet-stream",
      buffer: Buffer.from("MZ"),
    });
    await expect(
      page.getByRole("alert").filter({
        hasText: /PDF, TXT o CSV/i,
      }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirmar" })).toHaveCount(0);
  } finally {
    if (createdDocumentId) {
      try {
        await apiDelete(page, `/admin/documents/${createdDocumentId}`);
      } catch {
        // no tumbar el test si la limpieza falla
      }
    }
  }
});
