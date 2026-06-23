/**
 * health-monitoring/quality-score.ts — Composite Code Quality Score
 * (gstack extraction Initiative 5)
 *
 * Extracted from gstack /health: weighted composite 0-10 score.
 * Emits as MboMetricReport for the technical-debt-ratio gate (Phase 3)
 * and the deployment-success-rate gate (Phase 5).
 *
 * Weights: type-check 25%, lint 20%, test pass-rate 30%, dead-code 15%, shell-lint 10%
 */

export interface QualityScoreInput {
  typeCheckPass: boolean;
  lintErrors: number;
  lintTotal: number;
  testPass: number;
  testTotal: number;
  deadCodeFiles: number;
  totalFiles: number;
  shellLintPass: boolean;
}

export interface QualityScoreResult {
  score: number; // 0-10 weighted
  breakdown: {
    typeCheck: number; // 0 or 2.5
    lint: number; // 0-2.0
    testPassRate: number; // 0-3.0
    deadCodeRatio: number; // 0-1.5
    shellLint: number; // 0 or 1.0
  };
  failingComponents: string[];
}

export function computeQualityScore(input: QualityScoreInput): QualityScoreResult {
  const failing: string[] = [];

  // Type-check (25% = 2.5 pts)
  const typeCheck = input.typeCheckPass ? 2.5 : 0;
  if (!input.typeCheckPass) failing.push("type-check");

  // Lint (20% = 2.0 pts) — proportional to error-free ratio
  const lintRatio = input.lintTotal > 0 ? 1 - input.lintErrors / input.lintTotal : 1;
  const lint = lintRatio * 2.0;
  if (input.lintErrors > 0) failing.push(`lint (${input.lintErrors} errors)`);

  // Test pass-rate (30% = 3.0 pts)
  const testRatio = input.testTotal > 0 ? input.testPass / input.testTotal : 0;
  const testPassRate = testRatio * 3.0;
  if (input.testPass < input.testTotal) failing.push(`tests (${input.testPass}/${input.testTotal})`);

  // Dead-code ratio (15% = 1.5 pts) — proportional to clean ratio
  const deadRatio = input.totalFiles > 0 ? input.deadCodeFiles / input.totalFiles : 0;
  const deadCodeScore = (1 - deadRatio) * 1.5;
  if (input.deadCodeFiles > 0) failing.push(`dead-code (${input.deadCodeFiles} files)`);

  // Shell-lint (10% = 1.0 pts)
  const shellLint = input.shellLintPass ? 1.0 : 0;
  if (!input.shellLintPass) failing.push("shell-lint");

  const score = typeCheck + lint + testPassRate + deadCodeScore + shellLint;

  return {
    score: Math.round(score * 10) / 10,
    breakdown: { typeCheck, lint, testPassRate, deadCodeRatio: deadCodeScore, shellLint },
    failingComponents: failing,
  };
}
