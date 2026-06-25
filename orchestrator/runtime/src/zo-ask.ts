/**
 * runtime — /zo/ask client (ADR-0004)
 *
 * Wraps the Zo /zo/ask API as the agent-turn execution mechanism.
 * The runtime calls this per turn; agents never call it directly.
 *
 * Injectable: tests pass a mock function instead of hitting the real API.
 */
import { ZO_ASK_MODEL } from "./config";

export interface ZoAskResult {
  output: string;
  turnId: string;
}

export type ZoAskFn = (input: string, opts?: ZoAskOpts) => Promise<ZoAskResult>;

export interface ZoAskOpts {
  model?: string;
  conversationId?: string;
}

/**
 * Real /zo/ask implementation using the platform API.
 * Uses ZO_CLIENT_IDENTITY_TOKEN (auto-available in the runtime environment).
 */
export const realZoAsk: ZoAskFn = async (input, opts = {}) => {
  const token = process.env.ZO_CLIENT_IDENTITY_TOKEN;
  if (!token) {
    throw new Error("ZO_CLIENT_IDENTITY_TOKEN not set — runtime cannot spawn agent turns");
  }

  const res = await fetch("https://api.zo.computer/zo/ask", {
    method: "POST",
    headers: {
      authorization: token,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      input,
      model_name: opts.model ?? ZO_ASK_MODEL,
      ...(opts.conversationId ? { conversation_id: opts.conversationId } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "<no body>");
    throw new Error(`/zo/ask failed ${res.status}: ${body}`);
  }

  const data = (await res.json()) as { output: string };
  return {
    output: typeof data.output === "string" ? data.output : JSON.stringify(data.output),
    turnId: `turn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  };
};
