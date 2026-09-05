import { oauthProtectedResourceMetadata } from "@/lib/mcp-auth";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  try {
    return Response.json(oauthProtectedResourceMetadata(request.url), {
      headers: { "Cache-Control": "public, max-age=300" },
    });
  } catch {
    return Response.json({ error: "OAuth is not configured." }, { status: 503 });
  }
}
