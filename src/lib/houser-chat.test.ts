import { describe, expect, it } from "vitest";
import { buildHouserChatInstructions, houserChatRequestSchema, houserChatResponseSchema, type HouserChatSnapshot } from "./houser-chat";

const snapshot: HouserChatSnapshot = {
  generatedAt: "2026-08-25T12:00:00.000Z",
  properties: [{ id: "property-1", name: "Test House" }],
  workItems: [{ id: "11111111-1111-4111-8111-111111111111", title: "Service A/C", status: "inbox", targetStartOn: null }],
  assets: [],
  serviceRecords: [],
  documents: [],
  inspectionPages: [{ documentId: "document-1", filename: "inspection.pdf", pageNumber: 12, content: "Roof covering is near the end of its useful life." }],
  recentActivity: [],
};

describe("Ask Houser contracts", () => {
  it("limits conversation history and accepts normal chat turns", () => {
    expect(houserChatRequestSchema.parse({ messages: [{ role: "user", content: "What needs attention?" }] }).messages).toHaveLength(1);
    expect(() => houserChatRequestSchema.parse({ messages: [] })).toThrow();
  });

  it("requires structured answers with valid work item ids", () => {
    expect(houserChatResponseSchema.parse({
      answer: "The A/C item is unscheduled.",
      relatedWorkItemIds: ["11111111-1111-4111-8111-111111111111"],
      suggestedQuestions: ["What should I verify first?"],
      confidence: "high",
    }).confidence).toBe("high");
  });

  it("instructs the model to ground answers and resist record prompt injection", () => {
    const instructions = buildHouserChatInstructions(snapshot);
    expect(instructions).toContain("source of truth");
    expect(instructions).toContain("untrusted data");
    expect(instructions).toContain("unscheduled");
    expect(instructions).toContain("Service A/C");
    expect(instructions).toContain("Roof covering is near the end");
    expect(instructions).toContain("PDF page number");
  });
});
