import { NextResponse } from "next/server";
import { answerHouserQuestion, AskHouserAuthenticationError, AskHouserConfigurationError, AskHouserCreditsError } from "@/lib/ask-houser";
import { houserChatRequestSchema } from "@/lib/houser-chat";

export const maxDuration = 60;

export async function POST(request: Request) {
  const parsed = houserChatRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a question for Houser." }, { status: 400 });

  try {
    return NextResponse.json(await answerHouserQuestion(parsed.data.messages));
  } catch (error) {
    if (error instanceof AskHouserAuthenticationError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof AskHouserConfigurationError) {
      return NextResponse.json({ error: "Ask Houser is not configured yet." }, { status: 503 });
    }
    if (error instanceof AskHouserCreditsError) {
      return NextResponse.json({
        error: "Ask Houser needs OpenAI API credits before it can answer.",
        code: "openai_credits_exhausted",
        actionUrl: "https://platform.openai.com/settings/organization/billing/overview",
      }, { status: 503 });
    }
    console.error("Ask Houser failed", error);
    return NextResponse.json({ error: "Houser could not answer that right now. Please try again." }, { status: 500 });
  }
}
