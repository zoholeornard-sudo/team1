/**
 * edit-coordinator — bounded context service (ADR-0001)
 * Port: :3106
 *
 * Stub. Milestone 1 will implement bus boot + health ping.
 * See orchestrator/docs/adr/ for design decisions.
 */
import { IntentType } from "@team1/contracts";

const PORT = Number(process.env.PORT) || 3106;
const SERVICE_NAME = "edit-coordinator";

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
