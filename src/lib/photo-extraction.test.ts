import { describe, expect, it } from "vitest";
import { buildPhotoSearchContent, photoExtractionSchema } from "./photo-extraction";

describe("photo attachment extraction", () => {
  it("keeps observations searchable without turning uncertainty into fact", () => {
    const analysis = photoExtractionSchema.parse({
      title: "Water staining near upstairs vent",
      summary: "A ceiling vent has nearby discoloration.",
      visibleText: "",
      category: "HVAC",
      area: "Upstairs bedroom",
      observations: ["Brown discoloration is visible beside the vent."],
      safetyConcerns: [],
      suggestedWorkTitle: "Investigate staining near upstairs vent",
      suggestedWorkDescription: "Determine whether the staining is active and identify the source.",
      confidence: "medium",
    });

    const indexed = buildPhotoSearchContent(analysis);
    expect(indexed).toContain("Brown discoloration");
    expect(indexed).toContain("Suggested work");
    expect(indexed).toContain("HVAC");
  });
});
