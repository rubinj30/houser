import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createHouseholdProperty: vi.fn(),
  headers: vi.fn(),
  redirect: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/property-mutations", () => ({ createHouseholdProperty: mocks.createHouseholdProperty }));
vi.mock("@/lib/supabase/admin", () => ({ isHouserEmailAllowed: vi.fn() }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { createInitialWorkspaceAction, requestAccountCreationAction } from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.headers.mockResolvedValue(new Headers({ origin: "https://houser.test" }));
});

describe("account onboarding actions", () => {
  it("sends a normalized signup link back to the welcome flow", async () => {
    const signInWithOtp = vi.fn(async () => ({ error: null }));
    mocks.createClient.mockResolvedValue({ auth: { signInWithOtp } });

    await expect(requestAccountCreationAction({ email: " New.Owner@Example.com " })).resolves.toEqual({ sent: true });
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "new.owner@example.com",
      options: {
        emailRedirectTo: "https://houser.test/auth/confirm?next=%2F%3Fwelcome%3D1",
        shouldCreateUser: true,
      },
    });
  });

  it("creates an empty first property instead of seeding a sample home", async () => {
    const rpc = vi.fn(async () => ({ data: "account-id", error: null }));
    mocks.createClient.mockResolvedValue({
      auth: { getClaims: vi.fn(async () => ({ data: { claims: { sub: "user-id" } }, error: null })) },
      rpc,
    });
    const formData = new FormData();
    formData.set("displayName", "Oak Street");
    formData.set("propertyType", "rental");

    await createInitialWorkspaceAction(formData);

    expect(rpc).toHaveBeenCalledWith("bootstrap_account", { account_name: "Houser" });
    expect(mocks.createHouseholdProperty).toHaveBeenCalledWith(expect.anything(), "user-id", {
      displayName: "Oak Street",
      propertyType: "rental",
      addressLine1: null,
      city: null,
      region: null,
      postalCode: null,
      timezone: "America/New_York",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/");
    expect(mocks.redirect).toHaveBeenCalledWith("/?welcome=1");
  });
});
