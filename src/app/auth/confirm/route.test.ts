import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  verifyOtp: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      exchangeCodeForSession: mocks.exchangeCodeForSession,
      verifyOtp: mocks.verifyOtp,
    },
    rpc: mocks.rpc,
  })),
}));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
  mocks.rpc.mockResolvedValue({ error: null });
});

describe("GET /auth/confirm", () => {
  it("preserves the safe post-signup welcome destination", async () => {
    const request = new NextRequest("https://houser.test/auth/confirm?code=verified&next=%2F%3Fwelcome%3D1");
    const response = await GET(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://houser.test/?welcome=1");
    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("verified");
    expect(mocks.rpc).toHaveBeenCalledWith("accept_account_invitations");
  });

  it("does not allow an external redirect after authentication", async () => {
    const request = new NextRequest("https://houser.test/auth/confirm?code=verified&next=%2F%2Fevil.example");
    const response = await GET(request);

    expect(response.headers.get("location")).toBe("https://houser.test/");
  });
});
