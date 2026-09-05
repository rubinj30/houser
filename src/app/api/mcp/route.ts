import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createHouserMcpServer } from "@/lib/houser-mcp";
import { houserMcpResource, mcpUnauthorizedResponse } from "@/lib/mcp-auth";
import { authenticateBearerToken } from "@/lib/supabase/bearer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, MCP-Protocol-Version, MCP-Session-Id, Last-Event-ID",
  "Access-Control-Expose-Headers": "MCP-Protocol-Version, MCP-Session-Id, WWW-Authenticate",
};

function withCors(response: Response) {
  const headers = new Headers(response.headers);
  Object.entries(corsHeaders).forEach(([name, value]) => headers.set(name, value));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function accessToken(request: Request) {
  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

async function handleMcpRequest(request: Request) {
  const token = accessToken(request);
  if (!token) return withCors(mcpUnauthorizedResponse(request.url));

  const identity = await authenticateBearerToken(token);
  if (!identity) return withCors(mcpUnauthorizedResponse(request.url, "The Houser access token is invalid or expired."));

  const server = createHouserMcpServer(identity.supabase);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  const response = await transport.handleRequest(request, {
    authInfo: {
      token,
      clientId: identity.clientId,
      scopes: ["openid", "email", "profile"],
      expiresAt: identity.expiresAt,
      resource: new URL(houserMcpResource(request.url)),
      extra: { userId: identity.userId },
    },
  });
  return withCors(response);
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function GET(request: Request) {
  return handleMcpRequest(request);
}

export async function POST(request: Request) {
  return handleMcpRequest(request);
}

export async function DELETE(request: Request) {
  return handleMcpRequest(request);
}
