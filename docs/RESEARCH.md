# Research Notes & Positioning

Sentinel is built on the thesis that software supply chain security is moving from **visibility** (static SBOMs) to **governance** (continuous, AI-driven, automated), and that **AI/ML components are the next attack surface** most tools still ignore.

## Key findings driving the design

### 1. Regulation is catching up fast

- **US Executive Order 14028** (May 2021) and the follow-on **EO 14144** established SBOM and secure-development practice mandates for federal software acquisitions. ([Perforce](https://www.perforce.com/blog/alm/executive-order-14028-compliance))
- **EU Cyber Resilience Act (CRA)**, effective 2027, requires security-by-design, vulnerability disclosure, and SBOMs for *all* products with digital elements sold in the EU. ([Netrise](https://www.netrise.io/xiot-security-blog/what-eo-14028-eu-cra-and-nist-csf-2.0-mean-for-software-supply-chain-transparency))
- **NIST CSF 2.0**, **NIS2**, and **CMMC 2.0** all converge on the same ask: prove, don't claim.

This pushes vendors from one-time SBOM exports to continuous, queryable, attestable governance. Sentinel is built on that shape.

### 2. AI-BOMs are becoming first-class

- **CycloneDX 1.6** added ML-BOM in April 2024. **SPDX 3.0** added an AI profile in April 2024.
- **NIST AI RMF** explicitly calls for AI-BOMs as part of its "Map" function.
- **62%** of security practitioners have no way to tell where LLMs are in use across their organisation. ([VentureBeat](https://venturebeat.com/security/seven-steps-to-ai-supply-chain-visibility))
- Models + datasets + prompt templates + MCP servers are the next under-tracked supply chain.

Sentinel treats HuggingFace models, datasets, and MCP servers as first-class components from day one. See the `mlModelDetector` and `mcpDetector` in `apps/scanner/internal/scan/detectors.go`.

### 3. The SBOM tool ecosystem is Go

- Syft, Grype, OSV-Scanner, OWASP Dependency-Check, Trivy are the leading open-source SCA tools in 2026. ([AppSec Santa](https://appsecsanta.com/sca-tools/open-source-sca-tools))
- They're all written in Go and all consume/produce CycloneDX + SPDX.
- Reinventing this layer is a mistake — we embrace it.

Sentinel's scanner is a Go service so it can trivially link against the syft library in the future for broader ecosystem coverage. We ship a hand-rolled detector set today for tight control over purl formatting and ML-BOM emission.

### 4. Static SBOMs ≠ governance

- Cloudsmith's 2026 guide explicitly frames 2026 as the "governance era" with three pillars: **MLSecOps** (model integrity), **binary lifecycle management** (artefact provenance), **agentic remediation** (collapsing MTTR). ([Cloudsmith](https://cloudsmith.com/blog/the-2026-guide-to-software-supply-chain-security-from-static-sboms-to-agentic-governance))
- Sonatype's 2026 State of the Software Supply Chain report: "policies that once lived as internal guidelines are becoming obligations." ([Sonatype](https://www.sonatype.com/state-of-the-software-supply-chain/2026/software-compliance))

Sentinel's entire product thesis is: **turn every SBOM into a living graph, every vulnerability into a justified risk score, every risk into a proposed fix, every fix into a one-click n8n dispatch.**

### 5. Claude Opus 4.7 unlocks the agentic layer

- With a 1M-token context window, we can feed Claude an entire project's SBOM and ask holistic questions.
- Prompt caching (`cache_control: { type: "ephemeral" }`) makes per-vulnerability calls cheap because the system prompt doesn't change.
- Structured JSON output + Zod validation eliminates the hallucination-into-prod risk.

See `packages/ai/src/prompts/risk-analysis.ts` for the risk scoring prompt and `packages/ai/src/risk.ts` for the schema-validated call wrapper.

## Competitive positioning

| Tool | Focus | Weak at |
|---|---|---|
| Snyk, GitHub Advanced Security | CVE scanning | AI-BOM, agentic remediation, custom policies |
| Anchore, Aqua, Prisma | Container security | Dev-stage shift-left, AI supply chain |
| JFrog Xray, Sonatype Nexus | Binary repos | Stand-alone governance layer |
| Sentinel | Agentic governance | Not a scanner — orchestrates scanners |

Sentinel is an **opinionated orchestration layer**, not yet-another-scanner. We embrace syft/osv/grype where they shine and layer AI + governance on top.

## Who buys this

Mid-to-large regulated-or-becoming-regulated companies: fintech, health-tech, government contractors, EU-exposed SaaS, any org with an SRE team and an upcoming CRA deadline. The buyer is a security architect or platform team lead who's been told "figure out SBOM governance" and doesn't want to string together seven tools.

## References

- [Cloudsmith — 2026 Guide to Software Supply Chain Security](https://cloudsmith.com/blog/the-2026-guide-to-software-supply-chain-security-from-static-sboms-to-agentic-governance)
- [Sonatype — 2026 State of the Software Supply Chain](https://www.sonatype.com/state-of-the-software-supply-chain/2026/software-compliance)
- [OpenSSF — Software Supply Chain Security WG](https://openssf.org/tag/software-supply-chain-security/)
- [Anchore — Syft & Grype](https://anchore.com/opensource/)
- [DebugLies — DevSecOps Trends 2026: AI Agents Revolutionizing Secure Software Development](https://debuglies.com/2026/01/07/devsecops-trends-2026-ai-agents-revolutionizing-secure-software-development/)
- [Dark Reading — SBOMs in 2026: Some Love, Some Hate, Much Ambivalence](https://www.darkreading.com/application-security/sboms-in-2026-some-love-some-hate-much-ambivalence)
- [VentureBeat — Seven steps to AI supply chain visibility](https://venturebeat.com/security/seven-steps-to-ai-supply-chain-visibility)
- [Perforce — Building a SBOM That Supports EO 14028 Compliance](https://www.perforce.com/blog/alm/executive-order-14028-compliance)
- [Netrise — What EO 14028, EU CRA, and NIST CSF 2.0 Mean for Software Supply Chain Transparency](https://www.netrise.io/xiot-security-blog/what-eo-14028-eu-cra-and-nist-csf-2.0-mean-for-software-supply-chain-transparency)
- [Sbomify — SBOM Scanning: How to Detect Vulnerabilities](https://sbomify.com/2026/02/01/sbom-scanning-vulnerability-detection/)
