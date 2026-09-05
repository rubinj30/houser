import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ authenticateBearerToken: vi.fn() }));

vi.mock("@/lib/supabase/bearer", () => ({ authenticateBearerToken: mocks.authenticateBearerToken }));

import { OPTIONS, POST } from "./route";

describe("/api/mcp authentication boundary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("advertises OAuth metadata when no bearer token is provided", async () => {
    const response = await POST(new Request("https://houser.test/api/mcp", { method: "POST" }));
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("https://houser.test/.well-known/oauth-protected-resource");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(mocks.authenticateBearerToken).not.toHaveBeenCalled();
  });

  it("rejects an invalid bearer token", async () => {
    mocks.authenticateBearerToken.mockResolvedValue(null);
    const response = await POST(new Request("https://houser.test/api/mcp", { method: "POST", headers: { authorization: "Bearer expired" } }));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: "unauthorized" });
  });

  it("supports cross-origin protocol preflight without authentication", () => {
    const response = OPTIONS();
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-headers")).toContain("Authorization");
  });
});
