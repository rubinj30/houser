import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function safeNext(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export async function GET(request: NextRequest) {
  const redirectTo = request.nextUrl.clone();
  redirectTo.pathname = safeNext(request.nextUrl.searchParams.get("next"));
  redirectTo.search = "";
  const supabase = await createClient();
  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;

  const result = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: new Error("Missing sign-in token") };

  if (!result.error) {
    const { error: invitationError } = await supabase.rpc("accept_account_invitations");
    if (invitationError && !invitationError.message.includes("Could not find the function")) {
      redirectTo.pathname = "/";
      redirectTo.searchParams.set("auth_error", "invite");
      return NextResponse.redirect(redirectTo);
    }
    return NextResponse.redirect(redirectTo);
  }
  redirectTo.pathname = "/";
  redirectTo.searchParams.set("auth_error", "1");
  return NextResponse.redirect(redirectTo);
}
