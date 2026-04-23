package scan

import (
	"strings"
)

// Built-in vulnerability catalog. In production this plugs into OSV, GitHub
// Advisory, or an internal mirror; the catalog keeps demos self-contained and
// integration tests deterministic.
//
// Each entry matches by package name + vulnerable version prefix.

type builtinVuln struct {
	Ecosystem        Ecosystem
	Name             string
	VulnerableRanges []string // startsWith on version
	FixedIn          string
	AdvisoryID       string
	Aliases          []string
	Severity         string
	CVSSScore        float64
	CVSSVector       string
	EPSSScore        float64
	Summary          string
	References       []Reference
}

var builtinCatalog = []builtinVuln{
	{
		Ecosystem:        EcosystemNPM,
		Name:             "lodash",
		VulnerableRanges: []string{"4.17.10", "4.17.11", "4.17.12", "4.17.13", "4.17.14", "4.17.15"},
		FixedIn:          "4.17.21",
		AdvisoryID:       "GHSA-jf85-cpcp-j695",
		Aliases:          []string{"CVE-2019-10744"},
		Severity:         "high",
		CVSSScore:        7.4,
		CVSSVector:       "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:N",
		EPSSScore:        0.41,
		Summary:          "Prototype pollution in lodash via defaultsDeep",
		References: []Reference{
			{Type: "advisory", URL: "https://github.com/advisories/GHSA-jf85-cpcp-j695"},
		},
	},
	{
		Ecosystem:        EcosystemNPM,
		Name:             "left-pad",
		VulnerableRanges: []string{"0.", "1.0.", "1.1.", "1.2."},
		FixedIn:          "1.3.0",
		AdvisoryID:       "GHSA-g6ww-v8xp-vmwg",
		Severity:         "medium",
		CVSSScore:        5.3,
		Summary:          "left-pad sabotage & denial-of-service on malformed input",
	},
	{
		Ecosystem:        EcosystemPyPI,
		Name:             "requests",
		VulnerableRanges: []string{"2.28.", "2.29.", "2.30."},
		FixedIn:          "2.31.0",
		AdvisoryID:       "GHSA-j8r2-6x86-q33q",
		Aliases:          []string{"CVE-2023-32681"},
		Severity:         "medium",
		CVSSScore:        6.1,
		EPSSScore:        0.18,
		Summary:          "requests leaks Proxy-Authorization on redirect cross-origin",
	},
	{
		Ecosystem:        EcosystemPyPI,
		Name:             "pyyaml",
		VulnerableRanges: []string{"5.0", "5.1", "5.2", "5.3", "5.4"},
		FixedIn:          "6.0",
		AdvisoryID:       "GHSA-8q59-q68h-6hv4",
		Aliases:          []string{"CVE-2020-14343"},
		Severity:         "critical",
		CVSSScore:        9.8,
		CVSSVector:       "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H",
		EPSSScore:        0.67,
		Summary:          "pyyaml full_load allows arbitrary code execution",
	},
	{
		Ecosystem:        EcosystemGoMod,
		Name:             "golang.org/x/net",
		VulnerableRanges: []string{"v0.0.0", "v0.1.0", "v0.2.0", "v0.3.0", "v0.4.0", "v0.5.0", "v0.6.0"},
		FixedIn:          "v0.7.0",
		AdvisoryID:       "GHSA-vvpx-j8f3-3w6h",
		Aliases:          []string{"CVE-2022-41723"},
		Severity:         "high",
		CVSSScore:        7.5,
		Summary:          "Uncontrolled resource consumption in golang.org/x/net/http2",
	},
	{
		Ecosystem:        EcosystemMLModel,
		Name:             "codellama/CodeLlama-7b",
		VulnerableRanges: []string{"1.0"},
		FixedIn:          "1.1",
		AdvisoryID:       "HF-ADV-2025-001",
		Severity:         "medium",
		Summary:          "Training data contains unreviewed third-party code with unclear license provenance",
	},
}

func resolveVulnerabilities(components []Component) []VulnerabilityRef {
	out := make([]VulnerabilityRef, 0, 8)
	for _, c := range components {
		for i := range builtinCatalog {
			v := &builtinCatalog[i]
			if v.Ecosystem != c.Ecosystem {
				continue
			}
			if !strings.EqualFold(v.Name, c.Name) && !equalIgnoreScope(v.Name, c.Name) {
				continue
			}
			if !anyPrefix(c.Version, v.VulnerableRanges) {
				continue
			}
			score := v.CVSSScore
			epss := v.EPSSScore
			out = append(out, VulnerabilityRef{
				ComponentPurl:  c.Purl,
				AdvisoryID:     v.AdvisoryID,
				Aliases:        append([]string(nil), v.Aliases...),
				Summary:        v.Summary,
				Severity:       v.Severity,
				CVSSScore:      ptrFloat(score),
				CVSSVector:     v.CVSSVector,
				EPSSScore:      ptrFloat(epss),
				FixedVersions:  []string{v.FixedIn},
				AffectedRanges: []any{map[string]any{"introduced": "0", "fixed": v.FixedIn}},
				References:     append([]Reference(nil), v.References...),
			})
		}
	}
	return out
}

func anyPrefix(s string, prefixes []string) bool {
	for _, p := range prefixes {
		if strings.HasPrefix(s, p) {
			return true
		}
	}
	return false
}

func equalIgnoreScope(a, b string) bool {
	sa := a
	sb := b
	if i := strings.LastIndex(a, "/"); i >= 0 {
		sa = a[i+1:]
	}
	if i := strings.LastIndex(b, "/"); i >= 0 {
		sb = b[i+1:]
	}
	return strings.EqualFold(sa, sb)
}

func ptrFloat(v float64) *float64 {
	if v == 0 {
		return nil
	}
	return &v
}
