import { afterEach, describe, expect, it } from "vitest";
import { GET } from "./route";

describe("OAuth protected resource metadata", () => {
  const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
    process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
  });

  it("points MCP clients to Supabase Auth discovery", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SITE_URL = "https://houser.example";
    const response = GET(new Request("https://houser.example/.well-known/oauth-protected-resource"));
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      resource: "https://houser.example/api/mcp",
      authorization_servers: ["https://project.supabase.co/auth/v1"],
      bearer_methods_supported: ["header"],
    }));
  });
});
