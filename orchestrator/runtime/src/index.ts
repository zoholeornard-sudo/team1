/**
 * runtime — agent session supervisor (ADR-0004: polling-agent model)
 *
 * The real agent runtime, not just a launcher. Subscribes to the bus, dequeues
 * intents per instance, feeds each into a /zo/ask turn as seed context.
 * Agents are stateless across turns; runtime holds all state.
 */
import type { AgentAssigned, TaskCreated } from "@orchestrator/contracts";

const PORT = Number(process.env.PORT) || 3109;

console.log("[runtime] booting — polling-agent execution model (ADR-0004)");

// Milestone 2: subscribe to intents:agent-assigned
// Milestone 2: for each assignment, spawn /zo/ask turn with seed context
// Milestone 2: emit Heartbeat every 30s on behalf of in-flight children
// Milestone 2: on agent return value, emit TaskCompleted / AcquireCheckout / EditIntent

Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/health") {
      return Response.json({ service: "runtime", status: "booting", model: "polling-agent" });
    }
    return new Response("Not found", { status: 404 });
  },
});

console.log("[runtime] listening on :" + PORT);
