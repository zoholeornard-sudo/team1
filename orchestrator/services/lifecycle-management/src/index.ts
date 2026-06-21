/**
 * lifecycle-management — bounded context service (ADR-0001)
 * Port: :3104
 *
 * Stub. Milestone 1 will implement bus boot + health ping.
 * See orchestrator/docs/adr/ for design decisions.
 */
import { IntentType } from "@orchestrator/contracts";

const PORT = Number(process.env.PORT) || 3104;
const SERVICE_NAME = "lifecycle-management";

console.log(`[${SERVICE_NAME}] booting on :${PORT}`);

// Milestone 1: subscribe to relevant intent streams (see infra/redis-keyspaces.md)
// Milestone 1: respond to health ping from event-coordination
// Milestone 2+: implement domain logic

Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/health") {
      return Response.json({ service: SERVICE_NAME, status: "booting", port: PORT });
    }
    return new Response("Not found", { status: 404 });
  },
});

console.log(`[${SERVICE_NAME}] listening on :${PORT}`);
