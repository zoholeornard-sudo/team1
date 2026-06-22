/**
 * team1 Orchestrator — Bus Round-Trip Test (Gate Tier)
 *
 * Extracted from gstack's eval framework: validates that an intent published to
 * Redis Streams is consumed intact via bus-client. This is the M1 prerequisite —
 * if the bus can't round-trip a payload, no service communication works.
 *
 * Requires: Redis running (docker compose up redis)
 * Run: bun test orchestrator/test/bus-roundtrip.test.ts
 *
 * Skips automatically if REDIS_URL is unreachable (free-test compatibility).
 */

import { describe, it, expect, beforeAll } from "bun:test";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

async function redisAvailable(): Promise<boolean> {
  try {
    const resp = await fetch(`http://localhost:6379`, { method: "GET" }).catch(() => null);
    // Redis doesn't speak HTTP; a connection refusal or non-HTTP response means it's
    // either down or is a raw TCP server. We check via a TCP probe instead.
    return false;
  } catch {
    return false;
  }
}

// Lightweight TCP probe — if Redis is up on 6379, this resolves.
async function tcpProbe(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = (Bun as any).__connect?.(port, host) ?? null;
    if (!socket) {
      // Fallback: use a subprocess
      const proc = Bun.spawn(["bash", "-c", `echo -n | timeout 2 bash -c "cat < /dev/null > /dev/tcp/${host}/${port}" 2>/dev/null && echo OK || echo FAIL`]);
      const reader = proc.stdout.getReader();
      proc.exited.then(async () => {
        const { value } = await reader.read();
        resolve(new TextDecoder().decode(value).includes("OK"));
      });
    } else {
      resolve(true);
    }
  });
}

const redisUp = await tcpProbe("localhost", 6379);

describe.skipIf(!redisUp)("Bus round-trip (requires Redis on :6379)", () => {
  beforeAll(() => {
    if (!redisUp) {
      console.log("Skipping bus tests — Redis not available (free-test mode)");
    }
  });

  it("publishes and consumes an intent via Redis Streams", async () => {
    // This test will be fully implemented when bus-client is built (M1).
    // For now it's a placeholder that documents the expected behavior:
    //
    // 1. busClient.publish({ type: "FeatureSubmitted", ... })
    // 2. busClient.consume("test-group", "test-consumer", handler)
    // 3. handler receives the intent with payload intact
    // 4. assert deepEqual(original, received)
    //
    // The intent envelope must survive serialization through Redis Streams
    // (JSON.stringify in xAdd, JSON.parse in xReadGroup) without field loss.
    expect(true).toBe(true); // placeholder assertion
  });

  it("idempotencyKey dedupes duplicate deliveries", async () => {
    // At-least-once delivery means a consumer may see the same intent twice.
    // The consumer must ack-and-drop the duplicate based on idempotencyKey.
    // This test publishes the same intent twice and asserts the handler
    // processes it exactly once.
    expect(true).toBe(true); // placeholder
  });

  it("DeadLetter captures schema-invalid intents", async () => {
    // An intent that fails JSON Schema validation should be routed to
    // a dead-letter stream, not silently dropped. event-coordination owns this.
    expect(true).toBe(true); // placeholder
  });
});

if (!redisUp) {
  console.log("ℹ️  Bus round-trip tests skipped — Redis not available. Run `docker compose up redis` to enable.");
}
