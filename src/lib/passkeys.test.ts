import { describe, expect, it } from "vitest";
import { passkeyErrorMessage, passkeyName } from "@/lib/passkeys";

describe("passkey helpers", () => {
  it("uses the authenticator friendly name when available", () => {
    expect(passkeyName({ id: "key-1", friendly_name: "iCloud Keychain", created_at: "2026-08-26T00:00:00Z" })).toBe("iCloud Keychain");
  });

  it("explains how to recover when no credential is found", () => {
    expect(passkeyErrorMessage({ code: "webauthn_credential_not_found" }, "sign-in")).toContain("Use an email link");
  });

  it("treats canceled browser ceremonies as a non-destructive cancellation", () => {
    expect(passkeyErrorMessage({ code: "ERROR_CEREMONY_ABORTED" }, "register")).toBe("The Face ID or passkey prompt was canceled. Nothing was changed.");
  });

  it("does not expose unexpected provider errors", () => {
    expect(passkeyErrorMessage(new Error("sensitive provider details"), "sign-in")).toBe("Houser could not sign you in with Face ID or a passkey. Try again or use an email link.");
  });
});
