import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import type { createBearerClient } from "@/lib/supabase/bearer";
import { createHouserMcpServer } from "@/lib/houser-mcp";

type BearerClient = ReturnType<typeof createBearerClient>;

function propertyClient(): BearerClient {
  const rows = [{ id: "02c81548-65da-436a-9d2d-a9070e3e0a61", display_name: "Ivy Falls", property_type: "primary_residence", city: "Sandy Springs", region: "GA" }];
  const query = {
    select() { return this; },
    eq() { return this; },
    order: async () => ({ data: rows, error: null }),
  };
  return { from: () => query } as unknown as BearerClient;
}

describe("Houser MCP server", () => {
  it("publishes a focused tool inventory and returns RLS-scoped properties", async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createHouserMcpServer(propertyClient());
    const client = new Client({ name: "houser-test", version: "1.0.0" });
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const inventory = await client.listTools();
    expect(inventory.tools.map((tool) => tool.name)).toEqual([
      "list_properties",
      "search_work_items",
      "get_work_item",
      "create_work_item",
      "update_work_item",
      "complete_work_item",
    ]);
    expect(inventory.tools.find((tool) => tool.name === "list_properties")?.annotations?.readOnlyHint).toBe(true);
    expect(inventory.tools.find((tool) => tool.name === "create_work_item")?.annotations?.readOnlyHint).toBe(false);

    const result = await client.callTool({ name: "list_properties", arguments: {} });
    expect(result.structuredContent).toEqual({
      properties: [{ id: "02c81548-65da-436a-9d2d-a9070e3e0a61", displayName: "Ivy Falls", propertyType: "primary_residence", city: "Sandy Springs", region: "GA" }],
    });

    await client.close();
  });
});
