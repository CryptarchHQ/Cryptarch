import { describe, expect, it, vi } from "vitest";
import { createIntegration, isStepValid } from "./NewIntegrationPage";

describe("isStepValid", () => {
  it("paso 0 exige name y base_url http(s)", () => {
    expect(
      isStepValid(0, {
        service: { name: "CRM", base_url: "https://api.example.com" },
      }),
    ).toBe(true);
    expect(
      isStepValid(0, { service: { name: "", base_url: "https://x.com" } }),
    ).toBe(false);
    expect(
      isStepValid(0, { service: { name: "CRM", base_url: "ftp://x.com" } }),
    ).toBe(false);
  });

  it("paso 1 exige action.name y action.path", () => {
    expect(isStepValid(1, { action: { name: "Buscar", path: "/v1" } })).toBe(
      true,
    );
    expect(isStepValid(1, { action: { name: "Buscar", path: "" } })).toBe(
      false,
    );
  });

  it("paso 2 invalida nombres técnicos duplicados", () => {
    expect(
      isStepValid(2, {
        fields: {
          items: [
            { label: "A", name: "x" },
            { label: "B", name: "x" },
          ],
        },
      }),
    ).toBe(false);
    expect(
      isStepValid(2, {
        fields: {
          items: [
            { label: "A", name: "a" },
            { label: "B", name: "b" },
          ],
        },
      }),
    ).toBe(true);
  });
});

describe("createIntegration", () => {
  it("sin connectorId hace POST connectors y POST actions con version string y request_config sin query_params", async () => {
    const posts = [];
    const apiClient = {
      post: vi.fn(async (path, body) => {
        posts.push({ path, body });
        if (path === "/admin/connectors") {
          return { id: "conn-1" };
        }
        return { id: "act-1" };
      }),
    };

    const draft = {
      service: {
        name: "CRM",
        description: "",
        base_url: "https://api.example.com",
        auth_config: null,
      },
      action: {
        name: "Buscar cliente",
        method: "GET",
        path: "v1/customers",
        useConnectorAuth: true,
        contentType: "application/json",
        timeout: "",
        headers: [],
        query: [],
        body: [],
      },
      fields: {
        items: [
          {
            label: "Buscar cliente",
            name: "buscar_cliente",
            type: "number",
            required: true,
          },
        ],
        tagIds: ["t1"],
      },
    };

    const result = await createIntegration({
      draft,
      connectorId: null,
      apiClient,
    });

    expect(result.connectorId).toBe("conn-1");
    expect(apiClient.post).toHaveBeenCalledTimes(2);

    expect(posts[0].path).toBe("/admin/connectors");
    expect(posts[0].body).toEqual({
      name: "CRM",
      base_url: "https://api.example.com",
      description: null,
      auth_config: null,
    });

    expect(posts[1].path).toBe("/admin/actions");
    expect(posts[1].body.connector_id).toBe("conn-1");
    expect(posts[1].body.name).toBe("Buscar cliente");
    expect(posts[1].body.method).toBe("GET");
    expect(posts[1].body.path).toBe("/v1/customers");
    expect(posts[1].body.input_schema_version).toBe("1");
    expect(typeof posts[1].body.input_schema_version).toBe("string");
    expect(posts[1].body.input_schema_json).toEqual({
      type: "object",
      properties: {
        buscar_cliente: {
          type: "number",
          description: "Buscar cliente",
        },
      },
      required: ["buscar_cliente"],
    });
    expect(posts[1].body.tag_ids).toEqual(["t1"]);
    expect(posts[1].body.request_config).not.toHaveProperty("query_params");
    expect(posts[1].body.request_config).toMatchObject({
      headers: {},
      query: {},
      auth: { mode: "connector" },
    });
    expect(posts[1].body.request_config).not.toHaveProperty("body");
  });

  it("con connectorId no crea conector", async () => {
    const apiClient = {
      post: vi.fn(async () => ({ id: "act-1" })),
    };

    await createIntegration({
      draft: {
        service: { name: "X", base_url: "https://x.com" },
        action: { name: "A", path: "/a", method: "POST" },
        fields: { items: [], tagIds: [] },
      },
      connectorId: "existing",
      apiClient,
    });

    expect(apiClient.post).toHaveBeenCalledTimes(1);
    expect(apiClient.post.mock.calls[0][0]).toBe("/admin/actions");
    expect(apiClient.post.mock.calls[0][1].connector_id).toBe("existing");
    expect(apiClient.post.mock.calls[0][1].input_schema_version).toBe("1");
  });
});
