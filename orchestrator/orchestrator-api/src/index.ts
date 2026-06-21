/**
 * orchestrator-api — REST entry point
 * Port: :3108
 *
 * Mints featureSlug (globally-unique kebab-case) at FeatureSubmitted time.
 * Emits FeatureSubmitted + SpawnAgents intents.
 */
const PORT = Number(process.env.PORT) || 3108;
console.log("[orchestrator-api] booting on :" + PORT);

// Milestone 2: POST /features -> mint featureSlug -> emit FeatureSubmitted
// Milestone 2: POST /features/:slug/spawn -> emit SpawnAgents

Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/health") {
      return Response.json({ service: "orchestrator-api", status: "booting" });
    }
    return new Response("Not found", { status: 404 });
  },
});
