/**
 * agent-registry — persona metadata + instance ledger + Manager authority
 * Port: :3107
 *
 * Enforces: SpawnAgents only from agents whose skill file "Reports To" = a Manager role.
 * (designer3 should-fix)
 */
const PORT = Number(process.env.PORT) || 3107;
console.log("[agent-registry] booting on :" + PORT);

// Milestone 2: load persona metadata from projects/team1/agent-skills/*.md
// Milestone 2: mint instance IDs (@handle-N), append to AGENTS.md instances ledger
// Milestone 2: enforce Manager authority on SpawnAgents

Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/health") {
      return Response.json({ service: "agent-registry", status: "booting" });
    }
    return new Response("Not found", { status: 404 });
  },
});
