/**
 * session-management — bounded context service (ADR-0001)
 * Port: :3102
 *
 * Milestone 1: bus boot + /healthz endpoint + bus connection.
 */
import { BusClient } from "@team1/bus-client";

const PORT = Number(process.env.PORT) || 3102;
const SERVICE_NAME = "session-management";
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

let busConnected = false;
let bootTime = Date.now();

// Connect to Redis bus (non-blocking — service still serves /healthz even if Redis is down)
const bus = new BusClient({ redisUrl: REDIS_URL, serviceName: SERVICE_NAME });
bus.connect().then(() => {
  busConnected = true;
  console.log("[session-management] connected to Redis bus");
}).catch((err) => {
  console.warn("[session-management] Redis bus connection failed (non-fatal):", err?.message);
});

const server = Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/healthz") {
      return Response.json({
        status: "ok",
        service: SERVICE_NAME,
        port: PORT,
        busConnected,
        uptime: Date.now() - bootTime,
      });
    }
    if (url.pathname === "/readyz") {
      return Response.json({
        ready: busConnected,
        service: SERVICE_NAME,
      });
    }
    return new Response("Not found", { status: 404 });
  },
});

console.log("[session-management] listening on :");

process.on("SIGTERM", () => {
  console.log("[session-management] shutting down");
  server.stop();
  process.exit(0);
});
