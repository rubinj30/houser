import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { expect, test as setup } from "@playwright/test";

const authFile = "e2e/.auth/user.json";

setup("authenticate the dedicated Houser test account", async ({ context, page, baseURL }) => {
  const email = process.env.E2E_USER_EMAIL;
  const password = process.env.E2E_USER_PASSWORD;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  setup.skip(!email || !password, "Set E2E_USER_EMAIL and E2E_USER_PASSWORD to run authenticated Work planning paths.");
  if (!baseURL || !supabaseUrl || !publishableKey || !email || !password) throw new Error("Playwright authentication is not configured.");

  const cookies: Array<{ name: string; value: string; options: CookieOptions }> = [];
  const supabase = createServerClient(supabaseUrl, publishableKey, {
    cookies: {
      getAll: () => cookies.map(({ name, value }) => ({ name, value })),
      setAll: (nextCookies) => {
        for (const nextCookie of nextCookies) {
          const index = cookies.findIndex(({ name }) => name === nextCookie.name);
          if (index >= 0) cookies[index] = nextCookie;
          else cookies.push(nextCookie);
        }
      },
    },
  });
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Could not authenticate the Playwright account: ${error.message}`);

  await context.addCookies(cookies.map(({ name, value, options }) => ({
    name,
    value,
    url: baseURL,
    httpOnly: options.httpOnly,
    secure: options.secure,
    sameSite: options.sameSite === "strict" ? "Strict" : options.sameSite === "none" ? "None" : "Lax",
  })));
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Primary navigation" }).or(page.getByRole("navigation", { name: "Mobile navigation" }))).toBeVisible();
  await mkdir(dirname(authFile), { recursive: true });
  await page.context().storageState({ path: authFile });
});
