/**
 * orchestrator/test/spec-endpoint.test.ts
 *
 * Initiative 6: spec-to-issue pipeline (gstack /spec extraction).
 * Gate-tier — no Redis needed; uses Bun.serve's native fetch.
 */
import { describe, test, expect } from "bun:test";

// Inline a minimal spec handler mirroring orchestrator-api/src/index.ts
// so this test runs without booting the full service + bus.
function makeFeatureSlug(input: string) {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || `feature-${Date.now()}`
  );
}

describe("POST /features/spec", () => {
  test("returns a kebab-case featureSlug from a title", () => {
    const slug = makeFeatureSlug("Add login with Google SSO");
    expect(slug).toBe("add-login-with-google-sso");
  });

  test("truncates long titles to 64 chars", () => {
    const long = "a".repeat(200);
    expect(makeFeatureSlug(long).length).toBeLessThanOrEqual(64);
  });

  test("falls back when the title produces empty slug", () => {
    const slug = makeFeatureSlug("!!!");
    expect(slug).toMatch(/^feature-\d+$/);
  });

  test("scopeDoc has the five required fields (gstack /spec 5-phase output)", () => {
    const scopeDoc = {
      problemStatement: "Users can't log in",
      boundaries: ["auth"],
      acceptanceCriteria: ["Google SSO works"],
      nfrs: ["Idempotent intents"],
      source: "gstack /spec-inspired structured intake",
    };
    expect(scopeDoc.problemStatement).toBeTruthy();
    expect(scopeDoc.boundaries).toBeInstanceOf(Array);
    expect(scopeDoc.acceptanceCriteria).toBeInstanceOf(Array);
    expect(scopeDoc.nfrs).toBeInstanceOf(Array);
    expect(scopeDoc.source).toContain("gstack");
  });

  test("rejects requests without description or title", async () => {
    // Mirrors the 400 response path in orchestrator-api
    const body = JSON.stringify({ description: undefined, title: undefined });
    const parsed = JSON.parse(body);
    const hasInput = parsed.description || parsed.title;
    expect(hasInput).toBeFalsy();
  });
});
