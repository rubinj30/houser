import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getHouserChatData: vi.fn(),
  parse: vi.fn(),
}));

vi.mock("@/lib/houser-chat-data", () => ({ getHouserChatData: mocks.getHouserChatData }));
vi.mock("openai", () => {
  class APIError extends Error {
    status?: number;
    code?: string;
    type?: string;
  }
  return {
    default: class OpenAI {
      static APIError = APIError;
      responses = { parse: mocks.parse };
    },
  };
});

import { POST } from "./route";

const workItemId = "11111111-1111-4111-8111-111111111111";
const propertyId = "22222222-2222-4222-8222-222222222222";
const updatedAt = "2026-08-25T12:00:00.000Z";

const snapshot = {
  generatedAt: "2026-08-26T12:00:00.000Z",
  properties: [{ id: propertyId, name: "Sample Home" }],
  workItems: [{ id: workItemId, title: "Investigate vent staining", updatedAt }],
  assets: [],
  serviceRecords: [],
  documents: [{ id: "document-1", filename: "vent-stain.png", documentType: "photo" }],
  attachmentPages: [{ documentId: "document-1", filename: "vent-stain.png", documentType: "photo", pageNumber: 1, content: "Stored photo analysis: brown discoloration is visible beside an upstairs vent. Confidence: medium." }],
  recentActivity: [],
};

function request(content = "What does the vent photo show?") {
  return new Request("http://houser.test/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: [{ role: "user", content }] }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.OPENAI_API_KEY = "test-key";
  mocks.getHouserChatData.mockResolvedValue({
    userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    snapshot,
    workItemIndex: new Map([[workItemId, { id: workItemId, reference: "manual-1", title: "Investigate vent staining", property: "Sample Home", category: "HVAC", status: "inbox", priority: "important", targetStartOn: null, targetEndOn: null, updatedAt }]]),
  });
});

afterEach(() => {
  delete process.env.OPENAI_API_KEY;
});

describe("POST /api/chat", () => {
  it("grounds the answer in stored attachment analysis", async () => {
    mocks.parse.mockResolvedValue({ output_parsed: {
      answer: "The stored analysis says brown discoloration is visible beside the vent; it does not establish the cause.",
      confidence: "medium",
      suggestedQuestions: [],
      relatedWorkItemIds: [workItemId],
      proposedAction: null,
    } });

    const response = await POST(request());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.relatedWorkItems).toEqual([expect.objectContaining({ id: workItemId, title: "Investigate vent staining" })]);
    const call = mocks.parse.mock.calls[0][0];
    expect(call.store).toBe(false);
    expect(call.instructions).toContain("vent-stain.png");
    expect(call.instructions).toContain("brown discoloration is visible");
    expect(call.instructions).toContain("stored photo analysis");
  });

  it("returns a valid update proposal for owner confirmation", async () => {
    const proposedAction = {
      type: "update_work_item",
      summary: "Mark the vent item planned.",
      workItemId,
      expectedUpdatedAt: updatedAt,
      title: null,
      description: null,
      category: null,
      area: null,
      workType: null,
      status: "planned",
      priority: null,
      targetStartOn: null,
      targetEndOn: null,
      note: "Planned in chat.",
    };
    mocks.parse.mockResolvedValue({ output_parsed: { answer: "I can update it.", confidence: "high", suggestedQuestions: [], relatedWorkItemIds: [], proposedAction } });
    const response = await POST(request("Mark the vent item planned"));
    await expect(response.json()).resolves.toMatchObject({ proposedAction });
  });

  it("returns a property proposal for confirmation", async () => {
    const proposedAction = {
      type: "create_property",
      summary: "Add the Oak Street rental.",
      displayName: "Oak Street Rental",
      propertyType: "rental",
      addressLine1: "123 Oak Street",
      city: "Atlanta",
      region: "GA",
      postalCode: "30303",
      timezone: "America/New_York",
    };
    mocks.parse.mockResolvedValue({ output_parsed: { answer: "I can add that property after you confirm.", confidence: "high", suggestedQuestions: [], relatedWorkItemIds: [], proposedAction } });
    const response = await POST(request("Add my rental at 123 Oak Street in Atlanta"));
    await expect(response.json()).resolves.toMatchObject({ proposedAction });
  });

  it("drops an action whose concurrency token is no longer current", async () => {
    mocks.parse.mockResolvedValue({ output_parsed: {
      answer: "I can update it.",
      confidence: "high",
      suggestedQuestions: [],
      relatedWorkItemIds: [],
      proposedAction: {
        type: "update_work_item",
        summary: "Update stale item.",
        workItemId,
        expectedUpdatedAt: "2026-08-20T12:00:00.000Z",
        title: null,
        description: null,
        category: null,
        area: null,
        workType: null,
        status: "planned",
        priority: null,
        targetStartOn: null,
        targetEndOn: null,
        note: null,
      },
    } });
    const response = await POST(request("Update the item"));
    await expect(response.json()).resolves.toMatchObject({ proposedAction: null });
  });

  it("requires an authenticated chat snapshot", async () => {
    mocks.getHouserChatData.mockResolvedValue(null);
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect(mocks.parse).not.toHaveBeenCalled();
  });
});
