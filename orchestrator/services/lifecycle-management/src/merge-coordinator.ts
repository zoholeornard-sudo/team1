/**
 * Multi-feature merge coordination (Milestone 5)
 *
 * Implements explicit dependency declaration only (§11.3, §11.8):
 * - POST /features/:slug/dependsOn/:otherSlug (Manager-authority)
 * - GET /features/:slug/dependencies
 * - Phase 5 entry gate: block if any dependency hasn't passed Phase 7
 *
 * Auto-detection via path-overlap is OUT OF SCOPE for M5 (deferred to M7+).
 */
import type { PhaseState } from "./index.js";

export interface FeatureDependency {
  feature: string;
  dependsOn: string;
  declaredAt: string;
  declaredBy: string;
}

export class MergeCoordinator {
  private dependencies = new Map<string, Set<string>>(); // feature → set of dependencies
  private phaseStates: Map<string, PhaseState>;

  constructor(phaseStates: Map<string, PhaseState>) {
    this.phaseStates = phaseStates;
  }

  /**
   * Declare a dependency: feature B depends on feature A.
   * Manager-authority required (caller must verify).
   * Rejects cycles (A→B→A).
   */
  declareDependency(
    feature: string,
    dependsOn: string,
    declaredBy: string
  ): { ok: boolean; reason?: string } {
    if (feature === dependsOn) {
      return { ok: false, reason: "cannot depend on self" };
    }

    // Check for cycles: does dependsOn already (transitively) depend on feature?
    if (this.wouldCreateCycle(feature, dependsOn)) {
      return { ok: false, reason: `cycle detected: ${dependsOn} already depends on ${feature}` };
    }

    if (!this.dependencies.has(feature)) {
      this.dependencies.set(feature, new Set());
    }
    this.dependencies.get(feature)!.add(dependsOn);

    console.log(
      `[MergeCoordinator] ${feature} now depends on ${dependsOn} (declared by ${declaredBy})`
    );
    return { ok: true };
  }

  /**
   * Get all dependencies for a feature.
   */
  getDependencies(feature: string): string[] {
    const deps = this.dependencies.get(feature);
    return deps ? Array.from(deps) : [];
  }

  /**
   * Can this feature enter Phase 5 (Deployment)?
   * Rule: every feature in feature.dependsOn must have Phase 7 = passed.
   */
  canEnterPhase5(feature: string): {
    ok: boolean;
    blockedBy: { feature: string; currentPhase: string; reason: string }[];
  } {
    const deps = this.dependencies.get(feature);
    if (!deps || deps.size === 0) {
      return { ok: true, blockedBy: [] };
    }

    const blockedBy: { feature: string; currentPhase: string; reason: string }[] = [];
    for (const dep of deps) {
      const state = this.phaseStates.get(dep);
      if (!state) {
        blockedBy.push({
          feature: dep,
          currentPhase: "unknown",
          reason: "dependency has no phase state — not submitted yet",
        });
        continue;
      }
      if (state.currentPhase !== "complete") {
        blockedBy.push({
          feature: dep,
          currentPhase: state.currentPhase,
          reason: `dependency at Phase ${state.currentPhase}, needs Phase 7 = passed`,
        });
      }
    }

    return { ok: blockedBy.length === 0, blockedBy };
  }

  /**
   * Cycle detection: would adding feature→dependsOn create a cycle?
   * True if dependsOn already (transitively) depends on feature.
   */
  private wouldCreateCycle(feature: string, dependsOn: string): boolean {
    const visited = new Set<string>();
    const queue = [dependsOn];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current === feature) return true;
      if (visited.has(current)) continue;
      visited.add(current);

      const deps = this.dependencies.get(current);
      if (deps) {
        for (const d of deps) {
          if (!visited.has(d)) queue.push(d);
        }
      }
    }

    return false;
  }

  /**
   * Export all dependencies (for inspection/debugging).
   */
  exportAll(): FeatureDependency[] {
    const result: FeatureDependency[] = [];
    for (const [feature, deps] of this.dependencies) {
      for (const dep of deps) {
        result.push({
          feature,
          dependsOn: dep,
          declaredAt: new Date().toISOString(),
          declaredBy: "system",
        });
      }
    }
    return result;
  }
}
