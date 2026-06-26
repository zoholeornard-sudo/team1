/**
 * M6: History scraper — parse reaped progress reports to generate execution metrics.
 *
 * Scans the working_files/progress/ directory for progress reports from reaped instances.
 * Generates aggregate metrics: runtime, token cost, plan accuracy.
 */
import fs from "fs/promises";
import path from "path";

export interface ProgressReport {
  handle: string;
  date: string;
  unit: string;
  phase: string;
  mboProgress: { metric: string; target: string; current: string; trend: string }[];
  artifactsProduced: { path: string; type: string }[];
  blockers: string[];
  escalations: string[];
  collaborationCount: number;
}

export interface FeatureHistory {
  featureSlug: string;
  instances: ProgressReport[];
  totalRuntimeMs: number;
  totalArtifacts: number;
  totalBlockers: number;
  completedAt: string | null;
}

export interface ScrapeResult {
  features: FeatureHistory[];
  totalInstances: number;
  totalArtifacts: number;
  totalBlockers: number;
  avgArtifactsPerInstance: number;
}

/**
 * Parse a single progress report markdown file.
 */
export async function parseProgressReport(filePath: string): Promise<ProgressReport | null> {
  try {
    const content = await fs.readFile(filePath, "utf8");
    const lines = content.split("\n");

    // Extract handle from filename or header
    const handleMatch = content.match(/\*\*Agent:\s*(\S+)\s*`(@[^`]+)`/);
    const handle = handleMatch?.[2] ?? path.basename(filePath, ".md");

    const dateMatch = content.match(/\*\*Report Date:\s*(\d{4}-\d{2}-\d{2})/);
    const date = dateMatch?.[1] ?? "unknown";

    const unitMatch = content.match(/\*\*Unit:\s*(.+)/);
    const unit = unitMatch?.[1]?.trim() ?? "unknown";

    const phaseMatch = content.match(/\*\*Lifecycle Phase:\s*(.+)/);
    const phase = phaseMatch?.[1]?.trim() ?? "unknown";

    // Parse MBO progress table
    const mboProgress: ProgressReport["mboProgress"] = [];
    let inMboSection = false;
    for (const line of lines) {
      if (line.includes("## MBO progress")) { inMboSection = true; continue; }
      if (inMboSection && line.startsWith("## ")) { inMboSection = false; continue; }
      if (inMboSection && line.startsWith("|") && !line.includes("Metric")) {
        const cols = line.split("|").map((c) => c.trim()).filter(Boolean);
        if (cols.length >= 4) {
          mboProgress.push({
            metric: cols[0],
            target: cols[1],
            current: cols[2],
            trend: cols[3] || "→",
          });
        }
      }
    }

    // Parse artifacts
    const artifactsProduced: ProgressReport["artifactsProduced"] = [];
    let inArtifactSection = false;
    for (const line of lines) {
      if (line.includes("## Artifacts produced")) { inArtifactSection = true; continue; }
      if (inArtifactSection && line.startsWith("## ")) { inArtifactSection = false; continue; }
      if (inArtifactSection && line.startsWith("|") && !line.includes("Artifact")) {
        const cols = line.split("|").map((c) => c.trim()).filter(Boolean);
        if (cols.length >= 2) {
          artifactsProduced.push({ path: cols[0], type: cols[1] });
        }
      }
    }

    // Count blockers and escalations
    const blockers = content.match(/## Blockers & risks/g) ? (content.match(/- \[/g) || []).length : 0;
    const escalations = content.match(/## Escalations/g) ? 1 : 0;
    const collaborationCount = (content.match(/\| @/g) || []).length;

    return { handle, date, unit, phase, mboProgress, artifactsProduced, blockers, escalations, collaborationCount };
  } catch {
    return null;
  }
}

/**
 * Scan a progress directory and aggregate all reports.
 */
export async function scrapeProgress(dir: string): Promise<ScrapeResult> {
  const features: FeatureHistory[] = [];
  let totalInstances = 0;
  let totalArtifacts = 0;
  let totalBlockers = 0;

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.name.endsWith(".md") || entry.name.startsWith("_")) continue;

      const filePath = path.join(dir, entry.name);
      const report = await parseProgressReport(file);
      if (!report) continue;

      totalInstances++;
      totalArtifacts += report.artifactsProduced.length;
      totalBlockers += typeof report.blockers === "number" ? report.blockers : 0;

      // Group by feature slug — match any file whose name starts with the slug
      // (e.g. "m6-test-1782517174811-architect-agent-2.md" → slug "m6-test-1782517174811")
      let featureSlug = "unknown";
      const nameNoExt = entry.name.replace(/\.md$/, "");
      // Try to find a matching feature slug prefix (anything before the last two handle segments)
      const segments = nameNoExt.split("-");
      if (segments.length >= 3) {
        // Last two segments are typically "agent-N" or "handle-N"
        featureSlug = segments.slice(0, -2).join("-");
      } else {
        featureSlug = nameNoExt;
      }
      let feature = features.find((f) => f.featureSlug === featureSlug);
      if (!feature) {
        feature = {
          featureSlug,
          instances: [],
          totalRuntimeMs: 0,
          totalArtifacts: 0,
          totalBlockers: 0,
          completedAt: null,
        };
        features.push(feature);
      }
      feature.instances.push(report);
      feature.totalArtifacts += report.artifactsProduced.length;
      feature.totalBlockers += typeof report.blockers === "number" ? report.blockers : 0;
    }
  } catch {
    // Directory doesn't exist yet — return empty result
  }

  return {
    features,
    totalInstances,
    totalArtifacts,
    totalBlockers,
    avgArtifactsPerInstance: totalInstances > 0 ? totalArtifacts / totalInstances : 0,
  };
}
