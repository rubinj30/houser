import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ answerHouserQuestion: vi.fn() }));

vi.mock("@/lib/ask-houser", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ask-houser")>();
  return { ...actual, answerHouserQuestion: mocks.answerHouserQuestion };
});

import { AskHouserAuthenticationError, AskHouserConfigurationError, AskHouserCreditsError } from "@/lib/ask-houser";
import { POST } from "./route";

function request(body: unknown) {
  return new Request("http://houser.test/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

describe("POST /api/chat", () => {
  beforeEach(() => vi.clearAllMocks());

  it("validates the request at the HTTP boundary", async () => {
    const response = await POST(request({ messages: [] }));
    expect(response.status).toBe(400);
    expect(mocks.answerHouserQuestion).not.toHaveBeenCalled();
  });

  it("returns the grounded service result", async () => {
    mocks.answerHouserQuestion.mockResolvedValue({ answer: "The roof item is unscheduled.", confidence: "high", relatedWorkItems: [], proposedAction: null });
    const response = await POST(request({ messages: [{ role: "user", content: "What is the roof status?" }] }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ answer: "The roof item is unscheduled." });
  });

  it.each([
    [new AskHouserAuthenticationError("Sign in to ask about your home."), 401],
    [new AskHouserConfigurationError("not configured"), 503],
    [new AskHouserCreditsError("no credits"), 503],
  ])("maps expected service failures", async (error, status) => {
    mocks.answerHouserQuestion.mockRejectedValue(error);
    const response = await POST(request({ messages: [{ role: "user", content: "Hello" }] }));
    expect(response.status).toBe(status);
  });
});
