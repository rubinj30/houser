import { expect, test } from "@playwright/test";

test.describe("Ask Houser critical path", () => {
  test.skip(
    !process.env.E2E_USER_EMAIL || !process.env.E2E_USER_PASSWORD,
    "Set the dedicated Playwright account to run authenticated Ask Houser paths.",
  );

  test("starts without canned suggestions and confirms a proposed change", async ({ page }) => {
    await page.route("**/api/chat", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          answer: "I can add the test rental after you confirm.",
          confidence: "high",
          relatedWorkItems: [],
          proposedAction: {
            type: "create_property",
            summary: "Add a disposable rental for the browser test.",
            displayName: "E2E Rental",
            propertyType: "rental",
            addressLine1: null,
            city: null,
            region: null,
            postalCode: null,
            timezone: "America/New_York",
          },
        }),
      });
    });
    await page.route("**/api/chat/actions", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ message: "Property created.", property: { id: "22222222-2222-4222-8222-222222222222", displayName: "E2E Rental" } }),
      });
    });

    await page.goto("/chat");
    await expect(page.getByRole("heading", { name: "What would you like to know?" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Send question" })).toBeDisabled();
    await expect(page.getByRole("button", { name: /suggest|urgent|roof|appliance/i })).toHaveCount(0);

    await page.getByPlaceholder("Message Houser…").fill("Add a test rental");
    await page.getByRole("button", { name: "Send question" }).click();
    const proposal = page.getByRole("region", { name: "Proposed Houser change" });
    await expect(proposal).toContainText("Add a disposable rental");
    await proposal.getByRole("button", { name: "Confirm & save" }).click();
    await expect(page.getByText("Property saved")).toBeVisible();
    await expect(page.getByRole("link", { name: /E2E Rental/ })).toBeVisible();
  });
});
