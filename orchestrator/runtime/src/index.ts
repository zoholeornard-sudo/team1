/**
 * runtime — agent session supervisor (ADR-0004: polling-agent model)
 *
 * The real agent runtime, not just a launcher. Subscribes to the bus, dequeues
 * intents per instance, feeds each into a /zo/ask turn as seed context.
 * Agents are stateless across turns; runtime holds all state.
 */
import { BusClient } from "@team1/bus-client";
import { RuntimeSupervisor } from "./supervisor.js";
import { callZoAsk } from "./zo-ask.js";
import { RUNTIME_PORT, DEFAULT_REDIS_URL, RUNTIME_SERVICE_NAME } from "./config.js";

const PORT = RUNTIME_PORT;

console.log(`[${RUNTIME_SERVICE_NAME}] booting — polling-agent execution model (ADR-0004)`);

const bus = new BusClient({
  redisUrl: DEFAULT_REDIS_URL,
  serviceName: RUNTIME_SERVICE_NAME,
});

const supervisor = new RuntimeSupervisor(bus, callZoAsk);

// Boot the supervisor (connects to bus, creates consumer groups, starts consuming)
supervisor.start().catch((err) => {
  console.error(`[${RUNTIME_SERVICE_NAME}] fatal: supervisor failed to start:`, err);
  process.exit(1);
});

Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/health" || url.pathname === "/healthz") {
      return Response.json({
        service: RUNTIME_SERVICE_NAME,
        status: "active",
        model: "polling-agent",
        inFlightTurns: supervisor.getInFlightCount(),
        busConnected: bus.getConnected(),
      });
    }
    if (url.pathname === "/readyz") {
      const ready = bus.getConnected();
      return new Response(
        JSON.stringify({ ready, service: RUNTIME_SERVICE_NAME }),
        { status: ready ? 200 : 503, headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response("Not found", { status: 404 });
  },
});

// Graceful shutdown
const shutdown = async (signal: string) => {
  console.log(`[${RUNTIME_SERVICE_NAME}] received ${signal}, shutting down...`);
  await supervisor.stop();
  process.exit(0);
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

console.log(`[${RUNTIME_SERVICE_NAME}] listening on :${PORT}`);
