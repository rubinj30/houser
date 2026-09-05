import "server-only";

import { createHash } from "node:crypto";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";
import { buildHouserChatInstructions, houserChatRequestSchema, houserChatResponseSchema, type HouserChatResponse, type HouserChatSnapshot } from "@/lib/houser-chat";
import { getHouserChatData } from "@/lib/houser-chat-data";

type ChatMessages = z.infer<typeof houserChatRequestSchema>["messages"];
type WorkItemContext = {
  id: string;
  propertyId: string;
  reference: string;
  title: string;
  property: string;
  category: string | null;
  status: string;
  priority: string;
  targetStartOn: string | null;
  targetEndOn: string | null;
  updatedAt: string;
};

type LinkableWorkItem = Pick<WorkItemContext, "id" | "propertyId" | "title">;

export type HouserContext = {
  userId: string;
  snapshot: HouserChatSnapshot;
  workItemIndex: Map<string, WorkItemContext>;
};

export type AskHouserResult = {
  answer: string;
  confidence: HouserChatResponse["confidence"];
  relatedWorkItems: Array<Omit<WorkItemContext, "updatedAt">>;
  proposedAction: HouserChatResponse["proposedAction"];
};

export class AskHouserAuthenticationError extends Error {}
export class AskHouserConfigurationError extends Error {}
export class AskHouserCreditsError extends Error {}

type AskHouserDependencies = {
  retrieveContext: (question: string) => Promise<HouserContext | null>;
  askModel: (input: { messages: ChatMessages; snapshot: HouserChatSnapshot; userId: string }) => Promise<HouserChatResponse>;
};

function escapeMarkdownLinkLabel(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("[", "\\[").replaceAll("]", "\\]");
}

export function linkWorkItemReferences(answer: string, workItems: LinkableWorkItem[]) {
  const matches = workItems.flatMap((item) => {
    const found: Array<{ start: number; end: number; item: LinkableWorkItem }> = [];
    let offset = 0;
    while (offset < answer.length) {
      const start = answer.indexOf(item.title, offset);
      if (start === -1) break;
      found.push({ start, end: start + item.title.length, item });
      offset = start + item.title.length;
    }
    return found;
  }).sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));

  const accepted: typeof matches = [];
  let cursor = 0;
  for (const match of matches) {
    if (match.start < cursor) continue;
    accepted.push(match);
    cursor = match.end;
  }
  if (!accepted.length) return answer;

  let linked = "";
  cursor = 0;
  for (const match of accepted) {
    const href = `/?property=${encodeURIComponent(match.item.propertyId)}&work=${encodeURIComponent(match.item.id)}`;
    linked += `${answer.slice(cursor, match.start)}[${escapeMarkdownLinkLabel(match.item.title)}](${href})`;
    cursor = match.end;
  }
  return linked + answer.slice(cursor);
}

async function askOpenAI({ messages, snapshot, userId }: Parameters<AskHouserDependencies["askModel"]>[0]) {
  if (!process.env.OPENAI_API_KEY) throw new AskHouserConfigurationError("Ask Houser is not configured.");
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await openai.responses.parse({
      model: process.env.OPENAI_CHAT_MODEL ?? "gpt-5.4-mini-2026-03-17",
      store: false,
      reasoning: { effort: "low" },
      max_output_tokens: 1400,
      safety_identifier: createHash("sha256").update(userId).digest("hex").slice(0, 32),
      instructions: buildHouserChatInstructions(snapshot),
      input: messages.map((message) => ({ role: message.role, content: message.content })),
      text: { format: zodTextFormat(houserChatResponseSchema, "houser_answer") },
    });
    if (!response.output_parsed) throw new Error("Houser could not produce an answer.");
    return response.output_parsed;
  } catch (error) {
    if (error instanceof OpenAI.APIError && error.status === 429 && (error.code === "credit_balance_exhausted" || error.type === "insufficient_quota")) {
      throw new AskHouserCreditsError("Ask Houser needs OpenAI API credits.");
    }
    throw error;
  }
}

const defaultDependencies: AskHouserDependencies = {
  retrieveContext: getHouserChatData,
  askModel: askOpenAI,
};

export async function answerHouserQuestion(messages: ChatMessages, dependencies: AskHouserDependencies = defaultDependencies): Promise<AskHouserResult> {
  const question = messages.at(-1)?.content ?? "";
  const context = await dependencies.retrieveContext(question);
  if (!context) throw new AskHouserAuthenticationError("Sign in to ask about your home.");

  const answer = await dependencies.askModel({ messages, snapshot: context.snapshot, userId: context.userId });
  const relatedWorkItems = answer.relatedWorkItemIds.flatMap((id) => {
    const item = context.workItemIndex.get(id);
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
      const propertyExists = context.snapshot.properties.some((property) => property.id === action.propertyId);
      return propertyExists ? action : null;
    }
    const item = context.workItemIndex.get(action.workItemId);
    return item?.updatedAt === action.expectedUpdatedAt ? action : null;
  })();

  return { answer: linkWorkItemReferences(answer.answer, relatedWorkItems), confidence: answer.confidence, relatedWorkItems, proposedAction };
}
