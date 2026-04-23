import { z } from "zod";

// NATS subjects and JetStream schemas.
// Convention: sentinel.<domain>.<action>
export const EventSubjects = {
  ScanRequested: "sentinel.scan.requested",
  ScanStarted: "sentinel.scan.started",
  ScanCompleted: "sentinel.scan.completed",
  ScanFailed: "sentinel.scan.failed",

  ComponentDiscovered: "sentinel.component.discovered",
  VulnerabilityDiscovered: "sentinel.vulnerability.discovered",
  VulnerabilityEnriched: "sentinel.vulnerability.enriched",

  RemediationProposed: "sentinel.remediation.proposed",
  RemediationApproved: "sentinel.remediation.approved",
  RemediationDispatched: "sentinel.remediation.dispatched",
  RemediationCompleted: "sentinel.remediation.completed",

  PolicyViolated: "sentinel.policy.violated",
  DriftDetected: "sentinel.drift.detected",
} as const;
export type EventSubject = (typeof EventSubjects)[keyof typeof EventSubjects];

export const ScanRequestedEventSchema = z.object({
  scanId: z.string().uuid(),
  projectId: z.string().uuid(),
  kind: z.string(),
  gitRef: z.string().optional(),
  commitSha: z.string().optional(),
  triggeredBy: z.string(),
  requestedAt: z.string().datetime(),
});
export type ScanRequestedEvent = z.infer<typeof ScanRequestedEventSchema>;

export const ScanCompletedEventSchema = z.object({
  scanId: z.string().uuid(),
  projectId: z.string().uuid(),
  componentCount: z.number().int(),
  vulnCount: z.number().int(),
  riskScore: z.number().int(),
  durationMs: z.number().int(),
  completedAt: z.string().datetime(),
});
export type ScanCompletedEvent = z.infer<typeof ScanCompletedEventSchema>;

export const VulnerabilityDiscoveredEventSchema = z.object({
  scanId: z.string().uuid(),
  projectId: z.string().uuid(),
  componentId: z.string().uuid(),
  vulnerabilityId: z.string().uuid(),
  advisoryId: z.string(),
  severity: z.string(),
  cvssScore: z.number().optional(),
  componentPurl: z.string(),
  discoveredAt: z.string().datetime(),
});
export type VulnerabilityDiscoveredEvent = z.infer<typeof VulnerabilityDiscoveredEventSchema>;

export const RemediationProposedEventSchema = z.object({
  remediationId: z.string().uuid(),
  vulnerabilityId: z.string().uuid(),
  scanId: z.string().uuid(),
  projectId: z.string().uuid(),
  kind: z.string(),
  requiresApproval: z.boolean().default(true),
  reasoning: z.string().optional(),
});
export type RemediationProposedEvent = z.infer<typeof RemediationProposedEventSchema>;

export const PolicyViolatedEventSchema = z.object({
  policyId: z.string().uuid(),
  policySlug: z.string(),
  scanId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  vulnerabilityId: z.string().uuid().optional(),
  action: z.string(),
  context: z.record(z.unknown()),
});
export type PolicyViolatedEvent = z.infer<typeof PolicyViolatedEventSchema>;
