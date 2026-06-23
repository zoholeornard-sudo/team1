/**
 * quality-score.test.ts — Tests for the composite quality score (Initiative 5)
 * Pure logic, no infrastructure needed. Runs in the gate tier.
 */
import { describe, expect, test } from "bun:test";
import { computeQualityScore } from "../services/health-monitoring/src/quality-score";

describe("computeQualityScore", () => {
  test("perfect score when all components pass", () => {
    const result = computeQualityScore({
      typeCheckPass: true,
      lintErrors: 0,
      lintTotal: 100,
      testPass: 50,
      testTotal: 50,
      deadCodeFiles: 0,
      totalFiles: 200,
      shellLintPass: true,
    });
    expect(result.score).toBe(10);
    expect(result.failingComponents).toHaveLength(0);
  });

  test("zero score when everything fails", () => {
    const result = computeQualityScore({
      typeCheckPass: false,
      lintErrors: 100,
      lintTotal: 100,
      testPass: 0,
      testTotal: 50,
      deadCodeFiles: 200,
      totalFiles: 200,
      shellLintPass: false,
    });
    expect(result.score).toBe(0);
    expect(result.failingComponents).toHaveLength(5);
  });

  test("type-check failure costs 2.5 points", () => {
    const result = computeQualityScore({
      typeCheckPass: false,
      lintErrors: 0,
      lintTotal: 100,
      testPass: 50,
      testTotal: 50,
      deadCodeFiles: 0,
      totalFiles: 200,
      shellLintPass: true,
    });
    expect(result.score).toBe(7.5);
    expect(result.failingComponents).toEqual(["type-check"]);
  });

  test("partial test failures scale proportionally", () => {
    const result = computeQualityScore({
      typeCheckPass: true,
      lintErrors: 0,
      lintTotal: 100,
      testPass: 40,
      testTotal: 50,
      deadCodeFiles: 0,
      totalFiles: 200,
      shellLintPass: true,
    });
    // 2.5 + 2.0 + (40/50 * 3.0 = 2.4) + 1.5 + 1.0 = 9.4
    expect(result.score).toBe(9.4);
    expect(result.failingComponents).toEqual(["tests (40/50)"]);
  });

  test("dead-code ratio scales proportionally", () => {
    const result = computeQualityScore({
      typeCheckPass: true,
      lintErrors: 0,
      lintTotal: 100,
      testPass: 50,
      testTotal: 50,
      deadCodeFiles: 30,
      totalFiles: 200,
      shellLintPass: true,
    });
    // 2.5 + 2.0 + 3.0 + (1 - 30/200 = 0.85 * 1.5 = 1.275 → rounded 1.3) + 1.0
    expect(result.score).toBeGreaterThanOrEqual(9.7);
    expect(result.score).toBeLessThanOrEqual(9.8);
  });
});
