import { describe, expect, it, vi } from "vitest";
import { answerHouserQuestion, AskHouserAuthenticationError, type HouserContext } from "./ask-houser";

const workItemId = "11111111-1111-4111-8111-111111111111";
const propertyId = "22222222-2222-4222-8222-222222222222";
const updatedAt = "2026-08-25T12:00:00.000Z";

const context: HouserContext = {
  userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  snapshot: {
    generatedAt: "2026-08-26T12:00:00.000Z",
    properties: [{ id: propertyId, name: "Sample Home" }],
    workItems: [{ id: workItemId, title: "Investigate vent staining", updatedAt }],
    assets: [], serviceRecords: [], documents: [], attachmentPages: [], recentActivity: [],
  },
  workItemIndex: new Map([[workItemId, {
    id: workItemId, propertyId, reference: "manual-1", title: "Investigate vent staining", property: "Sample Home",
    category: "HVAC", status: "inbox", priority: "important", targetStartOn: null, targetEndOn: null, updatedAt,
  }]]),
};

const messages = [{ role: "user" as const, content: "What does the vent photo show?" }];

describe("answerHouserQuestion", () => {
  it("retrieves relevant context and exposes only known related work", async () => {
    const retrieveContext = vi.fn().mockResolvedValue(context);
    const askModel = vi.fn().mockResolvedValue({
      answer: "The stored analysis notes discoloration; the cause is not established.", confidence: "medium",
      relatedWorkItemIds: [workItemId, "33333333-3333-4333-8333-333333333333"], proposedAction: null,
    });
    const result = await answerHouserQuestion(messages, { retrieveContext, askModel });
    expect(retrieveContext).toHaveBeenCalledWith(messages[0].content);
    expect(askModel).toHaveBeenCalledWith(expect.objectContaining({ messages, snapshot: context.snapshot, userId: context.userId }));
    expect(result.relatedWorkItems).toEqual([expect.objectContaining({ id: workItemId, title: "Investigate vent staining" })]);
    expect(result.relatedWorkItems[0]).not.toHaveProperty("updatedAt");
  });

  it("keeps a current update proposal for owner confirmation", async () => {
    const proposedAction = {
      type: "update_work_item" as const, summary: "Plan the vent work.", workItemId, expectedUpdatedAt: updatedAt,
      title: null, description: null, category: null, area: null, workType: null, status: "planned" as const,
      priority: null, targetStartOn: null, targetEndOn: null, note: "Planned in chat.",
    };
    const result = await answerHouserQuestion(messages, {
      retrieveContext: vi.fn().mockResolvedValue(context),
      askModel: vi.fn().mockResolvedValue({ answer: "Ready for confirmation.", confidence: "high", relatedWorkItemIds: [], proposedAction }),
    });
    expect(result.proposedAction).toEqual(proposedAction);
  });

  it("drops stale updates and work creation for an unknown property", async () => {
    const stale = await answerHouserQuestion(messages, {
      retrieveContext: vi.fn().mockResolvedValue(context),
      askModel: vi.fn().mockResolvedValue({ answer: "Ready.", confidence: "high", relatedWorkItemIds: [], proposedAction: {
        type: "update_work_item", summary: "Stale", workItemId, expectedUpdatedAt: "2026-08-20T12:00:00.000Z",
        title: null, description: null, category: null, area: null, workType: null, status: "planned",
        priority: null, targetStartOn: null, targetEndOn: null, note: null,
      } }),
    });
    expect(stale.proposedAction).toBeNull();

    const unknownProperty = await answerHouserQuestion(messages, {
      retrieveContext: vi.fn().mockResolvedValue(context),
      askModel: vi.fn().mockResolvedValue({ answer: "Ready.", confidence: "high", relatedWorkItemIds: [], proposedAction: {
        type: "create_work_item", summary: "Create work", propertyId: "44444444-4444-4444-8444-444444444444",
        title: "Unknown home", description: null, category: "General", area: "General", workType: "other",
        status: "inbox", priority: "routine", targetStartOn: null, targetEndOn: null, note: null,
      } }),
    });
    expect(unknownProperty.proposedAction).toBeNull();
  });

  it("requires an authenticated household context", async () => {
    await expect(answerHouserQuestion(messages, { retrieveContext: vi.fn().mockResolvedValue(null), askModel: vi.fn() }))
      .rejects.toBeInstanceOf(AskHouserAuthenticationError);
  });
});
