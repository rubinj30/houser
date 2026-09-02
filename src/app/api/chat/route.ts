import { createHash } from "node:crypto";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { NextResponse } from "next/server";
import { buildHouserChatInstructions, houserChatRequestSchema, houserChatResponseSchema } from "@/lib/houser-chat";
import { getHouserChatData } from "@/lib/houser-chat-data";

export const maxDuration = 60;

export async function POST(request: Request) {
  const parsed = houserChatRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a question for Houser." }, { status: 400 });

  const chatData = await getHouserChatData(parsed.data.messages.at(-1)?.content ?? "");
  if (!chatData) return NextResponse.json({ error: "Sign in to ask about your home." }, { status: 401 });
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "Ask Houser is not configured yet." }, { status: 503 });

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await openai.responses.parse({
      model: process.env.OPENAI_CHAT_MODEL ?? "gpt-5.4-mini-2026-03-17",
      store: false,
      reasoning: { effort: "low" },
      max_output_tokens: 1400,
      safety_identifier: createHash("sha256").update(chatData.userId).digest("hex").slice(0, 32),
      instructions: buildHouserChatInstructions(chatData.snapshot),
      input: parsed.data.messages.map((message) => ({ role: message.role, content: message.content })),
      text: { format: zodTextFormat(houserChatResponseSchema, "houser_answer") },
    });
    const answer = response.output_parsed;
    if (!answer) throw new Error("Houser could not produce an answer.");

    const relatedWorkItems = answer.relatedWorkItemIds.flatMap((id) => {
      const item = chatData.workItemIndex.get(id);
      if (!item) return [];
      return [{
        id: item.id,
        propertyId: item.propertyId,
        reference: item.reference,
        title: item.title,
        property: item.property,
        category: item.category,
        status: item.status,
        priority: item.priority,
        targetStartOn: item.targetStartOn,
        targetEndOn: item.targetEndOn,
      }];
    });

    const proposedAction = (() => {
      const action = answer.proposedAction;
      if (!action) return null;
      if (action.type === "create_property") return action;
      if (action.type === "create_work_item") {
        const propertyExists = chatData.snapshot.properties.some((property) => property.id === action.propertyId);
        return propertyExists ? action : null;
      }
      const item = chatData.workItemIndex.get(action.workItemId);
      if (!item || item.updatedAt !== action.expectedUpdatedAt) return null;
      return action;
    })();

    return NextResponse.json({
      answer: answer.answer,
      confidence: answer.confidence,
      relatedWorkItems,
      proposedAction,
    });
  } catch (error) {
    console.error("Ask Houser failed", error);
    if (error instanceof OpenAI.APIError && error.status === 429 && (error.code === "credit_balance_exhausted" || error.type === "insufficient_quota")) {
      return NextResponse.json({
        error: "Ask Houser needs OpenAI API credits before it can answer.",
        code: "openai_credits_exhausted",
        actionUrl: "https://platform.openai.com/settings/organization/billing/overview",
      }, { status: 503 });
    }
    return NextResponse.json({ error: "Houser could not answer that right now. Please try again." }, { status: 500 });
  }
}
