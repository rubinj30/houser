import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

async function seedInspectionReview() {
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: session, error: signInError } = await client.auth.signInWithPassword({
    email: process.env.E2E_USER_EMAIL!,
    password: process.env.E2E_USER_PASSWORD!,
  });
  if (signInError || !session.user) throw signInError ?? new Error("The E2E user could not sign in.");
  const { data: property, error: propertyError } = await client.from("properties").select("id").eq("display_name", "Playwright Test Home").single();
  if (propertyError) throw propertyError;

  const sourceType = "e2e_inspection_review";
  const { data: staleItems, error: staleError } = await client.from("work_items").select("id,source_document_id").eq("property_id", property.id).eq("source_type", sourceType);
  if (staleError) throw staleError;
  if (staleItems?.length) {
    const { error } = await client.from("work_items").delete().in("id", staleItems.map((item) => item.id));
    if (error) throw error;
    const documentIds = staleItems.flatMap((item) => item.source_document_id ? [item.source_document_id] : []);
    if (documentIds.length) {
      const { error: documentError } = await client.from("documents").delete().in("id", documentIds);
      if (documentError) throw documentError;
    }
  }

  const marker = Date.now();
  const { data: document, error: documentError } = await client.from("documents").insert({
    property_id: property.id,
    document_type: "inspection",
    original_filename: "playwright-inspection.pdf",
    mime_type: "application/pdf",
    byte_size: 1,
    storage_key: `${property.id}/e2e/${marker}.pdf`,
    storage_bucket: "inspection-documents",
    status: "accepted",
    uploaded_by: session.user.id,
  }).select("id").single();
  if (documentError) throw documentError;

  const titles = [`E2E guided review first ${marker}`, `E2E guided review second ${marker}`];
  const { data: workItems, error: workError } = await client.from("work_items").insert(titles.map((title, index) => ({
    property_id: property.id,
    source_document_id: document.id,
    source_key: `e2e-guided-${marker}-${index}`,
    source_section: `E2E.${index + 1}`,
    source_category: "Exterior",
    source_severity: index === 0 ? "safety_hazard" : "recommendation",
    title,
    description: "Verify this automated inspection finding.",
    work_type: "inspect",
    status: "inbox",
    priority: "routine",
    source_type: sourceType,
    created_by: session.user.id,
    updated_by: session.user.id,
  }))).select("id");
  if (workError) throw workError;

  return {
    titles,
    cleanup: async () => {
      await client.from("work_items").delete().in("id", (workItems ?? []).map((item) => item.id));
      await client.from("documents").delete().eq("id", document.id);
      await client.auth.signOut();
    },
  };
}

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

  test("a work item can choose an attachment from Photos or Camera", async ({ page }, testInfo) => {
    const title = `E2E attach chimney photo ${testInfo.project.name} ${Date.now()}`;
    const card = await createWorkItem(page, title, "Attach a photographed service report to this work item.");
    await card.getByRole("heading", { name: title, exact: true }).click();

    const workDialog = page.getByRole("dialog", { name: title });
    await workDialog.getByRole("button", { name: "Add file" }).click();
    const uploadDialog = page.getByRole("dialog", { name: "Attach a file" });
    await expect(uploadDialog).toContainText(`Attaching to: ${title}`);
    await expect(uploadDialog.getByRole("button", { name: "Files", exact: true })).toBeVisible();
    await expect(uploadDialog.getByRole("button", { name: "Photos", exact: true })).toBeVisible();
    await expect(uploadDialog.getByRole("button", { name: "Camera", exact: true })).toBeVisible();
    await expect(uploadDialog.getByLabel("Choose attachment from Photos")).toHaveAttribute("accept", "image/*");
    await expect(uploadDialog.getByLabel("Take a photo with Camera")).toHaveAttribute("capture", "environment");

    await uploadDialog.getByLabel("Choose attachment from Photos").setInputFiles({
      name: "chimney-service-report.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
    });
    await expect(uploadDialog.getByLabel("Attachment type")).toHaveValue("photo");
    await expect(uploadDialog.getByText("chimney-service-report.jpg", { exact: true })).toBeVisible();
    await expect(uploadDialog.getByRole("button", { name: "Upload & analyze with OpenAI" })).toBeEnabled();

    await uploadDialog.getByRole("button", { name: "Close" }).click();
    await workDialog.getByRole("button", { name: "Not applicable" }).click();
    await workDialog.getByLabel(/Why doesn't this apply/).fill("Created only to verify the mobile photo attachment picker.");
    await workDialog.getByRole("button", { name: "Save update" }).click();
    await expect(workDialog).toBeHidden();
  });

  test("guided inspection review advances through each pending finding", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "The guided flow is covered once; status controls already run at 360px.");
    const seeded = await seedInspectionReview();
    try {
      await page.goto("/");
      const priorities = page.locator('section[aria-labelledby="priorities-heading"]');
      await expect(priorities).toBeVisible();
      await expect(priorities).toContainText(seeded.titles[0]);
      await priorities.getByRole("button", { name: `Open priority: ${seeded.titles[0]}` }).click();
      await expect(page.getByRole("dialog", { name: seeded.titles[0] })).toBeVisible();
      await page.getByRole("dialog", { name: seeded.titles[0] }).getByRole("button", { name: "Close" }).click();
      await page.getByRole("button", { name: "Home", exact: true }).click();

      const reviewCard = page.getByText("Inspection review", { exact: true }).locator("..").locator("..");
      await expect(reviewCard).toContainText("0 of 2");
      await page.getByRole("button", { name: "Continue review" }).click();

      let dialog = page.getByRole("dialog");
      await expect(dialog).toContainText("Guided review · finding 1 of 2");
      const firstTitle = (await dialog.textContent())?.includes(seeded.titles[0]) ? seeded.titles[0] : seeded.titles[1];
      const secondTitle = firstTitle === seeded.titles[0] ? seeded.titles[1] : seeded.titles[0];
      await expect(dialog).toContainText(firstTitle);
      await dialog.getByRole("button", { name: "Still needs work" }).click();
      await dialog.getByLabel("What did you observe?").fill("Confirmed by the guided inspection E2E test.");
      await dialog.getByRole("button", { name: "Save update" }).click();

      dialog = page.getByRole("dialog");
      await expect(dialog).toContainText("Guided review · finding 2 of 2");
      await expect(dialog).toContainText(secondTitle);
      await dialog.getByRole("button", { name: "Not applicable" }).click();
      await dialog.getByLabel(/Why doesn't this apply/).fill("Dismissed by the guided inspection E2E test.");
      await dialog.getByRole("button", { name: "Save update" }).click();
      await expect(dialog).toBeHidden();
    } finally {
      await seeded.cleanup();
    }
  });
});
