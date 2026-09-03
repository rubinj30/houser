import { expect, test } from "@playwright/test";

async function createWorkItem(page: import("@playwright/test").Page, title: string, note: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "Add work", exact: true }).click();

  const dialog = page.getByRole("dialog", { name: "Add work" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("What needs to be done?").fill(title);
  await dialog.getByLabel(/Description/).fill(note);
  await dialog.getByRole("button", { name: "Save to work inbox" }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: /^Work(?: \d+)?$/ }).click();
  await page.getByPlaceholder("Search work, areas, or actions").fill(title);
  return page.getByRole("article").filter({ hasText: title });
}

test.describe("Work planning critical paths", () => {
  test.skip(
    !process.env.E2E_USER_EMAIL || !process.env.E2E_USER_PASSWORD,
    "Set the dedicated Playwright account to run authenticated Work planning paths.",
  );

  test("quick capture creates a reviewable Work item and preserves its note", async ({ page }, testInfo) => {
    const title = `E2E inspect condensate drain ${testInfo.project.name} ${Date.now()}`;
    const note = "Verify the drain line is clear before the next cooling season.";

    const card = await createWorkItem(page, title, note);
    await expect(card).toContainText("Needs review");
    await card.getByRole("heading", { name: title, exact: true }).click();
    const review = page.getByRole("dialog", { name: title });
    await expect(review).toContainText(note);

    await review.getByRole("button", { name: "Not applicable" }).click();
    await review.getByLabel(/Why doesn't this apply/).fill("Created by the automated critical-path test; dismiss after verification.");
    await review.getByRole("button", { name: "Save update" }).click();
    await expect(review).toBeHidden();
    await expect(card).toHaveCount(0);
  });

  test("an owner review moves Work into the active planned state", async ({ page }, testInfo) => {
    const title = `E2E review exterior seal ${testInfo.project.name} ${Date.now()}`;
    const card = await createWorkItem(page, title, "Confirm the exterior joint before scheduling repair.");
    await expect(card).toContainText("Needs review");

    await card.getByRole("button", { name: "Review item" }).click();
    const review = page.getByRole("dialog");
    await review.getByRole("button", { name: "Still needs work" }).click();
    await review.getByLabel("What did you observe?").fill("Confirmed by the Playwright Work planning test.");
    await review.getByRole("button", { name: "Save update" }).click();
    await expect(review.getByText("Still needs work", { exact: true }).first()).toBeVisible();
  });
});
