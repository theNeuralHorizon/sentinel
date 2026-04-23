// Curated license risk matrix. The LLM refines this but we need a deterministic baseline
// to avoid hallucinations on the hot path.
// Risk levels align with common enterprise policy buckets:
//   low       — permissive, no obligations beyond attribution
//   medium    — weak copyleft or permissive with notable obligations
//   high      — strong copyleft, SaaS loophole risk
//   critical  — incompatible with closed-source distribution
//   unknown   — no declared license; triage required

export type LicenseRisk = "low" | "medium" | "high" | "critical" | "unknown";

export interface LicenseEntry {
  spdxId: string;
  name: string;
  risk: LicenseRisk;
  category: "permissive" | "weak-copyleft" | "strong-copyleft" | "proprietary" | "cla" | "unknown";
  notes?: string;
}

const LICENSES: LicenseEntry[] = [
  // Permissive
  { spdxId: "MIT", name: "MIT License", risk: "low", category: "permissive" },
  { spdxId: "Apache-2.0", name: "Apache License 2.0", risk: "low", category: "permissive" },
  { spdxId: "BSD-2-Clause", name: "BSD 2-Clause", risk: "low", category: "permissive" },
  { spdxId: "BSD-3-Clause", name: "BSD 3-Clause", risk: "low", category: "permissive" },
  { spdxId: "ISC", name: "ISC License", risk: "low", category: "permissive" },
  { spdxId: "0BSD", name: "BSD Zero Clause", risk: "low", category: "permissive" },
  { spdxId: "Unlicense", name: "Unlicense", risk: "low", category: "permissive" },
  { spdxId: "CC0-1.0", name: "Creative Commons Zero", risk: "low", category: "permissive" },

  // Weak copyleft
  { spdxId: "MPL-2.0", name: "Mozilla Public License 2.0", risk: "medium", category: "weak-copyleft" },
  { spdxId: "LGPL-2.1", name: "Lesser GNU GPL 2.1", risk: "medium", category: "weak-copyleft" },
  { spdxId: "LGPL-3.0", name: "Lesser GNU GPL 3.0", risk: "medium", category: "weak-copyleft" },
  { spdxId: "EPL-2.0", name: "Eclipse Public License 2.0", risk: "medium", category: "weak-copyleft" },

  // Strong copyleft
  { spdxId: "GPL-2.0", name: "GNU GPL 2.0", risk: "high", category: "strong-copyleft" },
  { spdxId: "GPL-3.0", name: "GNU GPL 3.0", risk: "high", category: "strong-copyleft" },

  // SaaS loophole closed — trigger for distribution-over-network
  { spdxId: "AGPL-3.0", name: "GNU Affero GPL 3.0", risk: "critical", category: "strong-copyleft",
    notes: "Triggers distribution obligations even for SaaS." },
  { spdxId: "SSPL-1.0", name: "Server Side Public License", risk: "critical", category: "strong-copyleft",
    notes: "Non-OSI, viral on managed-service offerings (Mongo, ElasticSearch legacy)." },
  { spdxId: "BUSL-1.1", name: "Business Source License 1.1", risk: "high", category: "proprietary",
    notes: "Source-available; time-bomb commercial use restrictions." },

  // Other notable
  { spdxId: "WTFPL", name: "WTFPL", risk: "medium", category: "permissive",
    notes: "Corporate-unfriendly language; many legal teams ban it." },
  { spdxId: "CC-BY-NC-4.0", name: "CC BY-NC 4.0", risk: "critical", category: "proprietary",
    notes: "Non-commercial restriction — incompatible with most SaaS." },
];

export const LICENSE_INDEX: Map<string, LicenseEntry> = new Map(
  LICENSES.map((l) => [l.spdxId.toLowerCase(), l]),
);

const RISK_KEYWORDS: [RegExp, LicenseRisk][] = [
  [/agpl/i, "critical"],
  [/sspl/i, "critical"],
  [/non[- ]?commercial|nc[-_ ]?\d?/i, "critical"],
  [/\bgpl[^a-z]/i, "high"],
  [/business source/i, "high"],
  [/lgpl|mozilla|mpl|eclipse/i, "medium"],
  [/mit|apache|bsd|isc|cc0|unlicense|0bsd/i, "low"],
];

// classifyLicense is called on the hot path per component. It MUST be deterministic.
export function classifyLicense(raw: string | null | undefined): LicenseRisk {
  if (!raw) return "unknown";
  const normalized = raw.trim();
  const byId = LICENSE_INDEX.get(normalized.toLowerCase());
  if (byId) return byId.risk;

  // Handle expressions like "(MIT OR Apache-2.0)" — take the riskiest.
  const tokens = normalized.split(/\s+(?:AND|OR)\s+|[()]/i).filter(Boolean);
  if (tokens.length > 1) {
    const risks = tokens.map((t) => classifyLicense(t));
    return pickWorst(risks);
  }

  for (const [pattern, risk] of RISK_KEYWORDS) {
    if (pattern.test(normalized)) return risk;
  }
  return "unknown";
}

const RISK_ORDER: LicenseRisk[] = ["unknown", "low", "medium", "high", "critical"];
export function pickWorst(risks: LicenseRisk[]): LicenseRisk {
  let worst: LicenseRisk = "low";
  for (const r of risks) {
    if (RISK_ORDER.indexOf(r) > RISK_ORDER.indexOf(worst)) worst = r;
  }
  return worst;
}
