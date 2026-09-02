import { expect, test } from "@playwright/test";

test("the root offers simple account creation without hiding sign in", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Sign in to Houser" })).toBeVisible();
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByRole("heading", { name: "Create your Houser account" })).toBeVisible();
  await expect(page.getByLabel("Email address")).toHaveAttribute("type", "email");
  await expect(page.getByRole("button", { name: "Create account with email" })).toBeDisabled();
  await expect(page.getByText(/one secure link to verify it/i)).toBeVisible();

  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Sign in to Houser" })).toBeVisible();
});
