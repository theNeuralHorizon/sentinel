import type { Severity } from "./sbom";
import type { LicenseRisk } from "./licenses";

// Convert severity + CVSS + EPSS + license risk into a 0-100 business-aware score.
// The AI analyzer refines this per-vuln; this is the baseline without a live LLM call.

export interface RiskInputs {
  severity: Severity;
  cvssScore?: number | null;
  epssScore?: number | null; // 0-1, higher = more likely exploited
  licenseRisk?: LicenseRisk;
  isTransitive?: boolean;
  fixAvailable?: boolean;
  componentPopularity?: number; // 0-1; widely used → higher blast radius
}

const SEVERITY_BASE: Record<Severity, number> = {
  critical: 80,
  high: 60,
  medium: 40,
  low: 20,
  info: 5,
};

const LICENSE_MULT: Record<LicenseRisk, number> = {
  critical: 1.25,
  high: 1.1,
  medium: 1.0,
  low: 0.95,
  unknown: 1.05,
};

export function computeBaselineRisk(inputs: RiskInputs): number {
  let score = SEVERITY_BASE[inputs.severity];

  if (typeof inputs.cvssScore === "number") {
    // Interpolate toward CVSS × 10; e.g. 9.8 CVSS → 98. Weighted 40/60.
    score = 0.4 * score + 0.6 * inputs.cvssScore * 10;
  }

  if (typeof inputs.epssScore === "number") {
    // EPSS is probabilistic exploitation in next 30 days. Multiply by up to 1.2×.
    score *= 1 + Math.min(inputs.epssScore, 1) * 0.2;
  }

  if (inputs.licenseRisk) {
    score *= LICENSE_MULT[inputs.licenseRisk];
  }

  if (inputs.fixAvailable === false) {
    // Unpatchable: harder to remediate, escalate.
    score *= 1.15;
  }

  if (inputs.isTransitive) {
    // Transitive deps are harder to fix and often overlooked.
    score *= 1.05;
  }

  if (typeof inputs.componentPopularity === "number") {
    score *= 1 + inputs.componentPopularity * 0.1;
  }

  return Math.min(100, Math.round(score));
}

// Aggregate many vuln risk scores into one project-level score (0-100).
// Uses a "peak-weighted" average so one critical outweighs many mediums.
export function aggregateProjectRisk(scores: number[]): number {
  if (scores.length === 0) return 0;
  const peak = Math.max(...scores);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return Math.round(peak * 0.7 + avg * 0.3);
}
