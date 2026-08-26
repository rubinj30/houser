export type HouserPasskey = {
  id: string;
  friendly_name?: string;
  created_at: string;
  last_used_at?: string;
};

type PasskeyError = {
  code?: string;
  message?: string;
  name?: string;
};

export function browserSupportsPasskeys() {
  return typeof window !== "undefined" && "PublicKeyCredential" in window;
}

export function subscribeToPasskeySupport() {
  return () => undefined;
}

export function passkeyName(passkey: HouserPasskey) {
  return passkey.friendly_name?.trim() || "Passkey";
}

export function passkeyErrorMessage(error: unknown, action: "sign-in" | "register" | "list" | "delete") {
  const details = error && typeof error === "object" ? error as PasskeyError : {};
  const code = details.code ?? "";
  const message = details.message ?? "";

  if (code === "passkey_disabled") {
    return "Face ID and passkey sign-in are not enabled for this Houser environment yet. Use an email link for now.";
  }
  if (code === "webauthn_credential_not_found") {
    return "No Houser passkey was found. Use an email link, then add a passkey from Household settings.";
  }
  if (code === "webauthn_credential_exists" || code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED") {
    return "This Face ID or passkey is already connected to your Houser account.";
  }
  if (code === "too_many_passkeys") {
    return "This account has reached its passkey limit. Remove an older passkey before adding another one.";
  }
  if (code === "ERROR_CEREMONY_ABORTED" || details.name === "AbortError" || details.name === "NotAllowedError") {
    return "The Face ID or passkey prompt was canceled. Nothing was changed.";
  }
  if (code === "ERROR_INVALID_DOMAIN" || code === "ERROR_INVALID_RP_ID" || code === "webauthn_verification_failed") {
    return "This Houser address is not configured for Face ID or passkeys. Use the production site or sign in by email.";
  }
  if (/cancel|abort|not allowed/i.test(message)) {
    return "The Face ID or passkey prompt was canceled. Nothing was changed.";
  }
  if (/does not support WebAuthn/i.test(message)) {
    return "This browser does not support Face ID or passkeys. Use an email sign-in link instead.";
  }

  const fallback = {
    "sign-in": "Houser could not sign you in with Face ID or a passkey. Try again or use an email link.",
    register: "Houser could not add this Face ID or passkey. Try again on the production site.",
    list: "Houser could not load your passkeys right now.",
    delete: "Houser could not remove that passkey right now.",
  } as const;
  return fallback[action];
}
