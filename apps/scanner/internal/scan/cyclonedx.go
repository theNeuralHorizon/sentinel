package scan

import (
	"encoding/json"
	"time"
)

// RenderCycloneDX emits a CycloneDX 1.6 JSON SBOM with vulnerabilities inlined
// under the 'vulnerabilities' key, per spec section 5.5.
//
// We do NOT depend on the external cyclonedx-go library to keep the binary
// small and avoid version churn; the schema surface we need is tiny.

type cdxComponent struct {
	BOMRef     string         `json:"bom-ref"`
	Type       string         `json:"type"`
	Name       string         `json:"name"`
	Version    string         `json:"version"`
	Purl       string         `json:"purl"`
	CPE        string         `json:"cpe,omitempty"`
	Supplier   *cdxSupplier   `json:"supplier,omitempty"`
	Licenses   []cdxLicense   `json:"licenses,omitempty"`
	ExternalRefs []cdxExtRef  `json:"externalReferences,omitempty"`
	Hashes     []cdxHash      `json:"hashes,omitempty"`
	Properties []cdxProperty  `json:"properties,omitempty"`
}

type cdxSupplier struct {
	Name string `json:"name"`
}

type cdxLicense struct {
	License struct {
		ID   string `json:"id,omitempty"`
		Name string `json:"name,omitempty"`
	} `json:"license"`
}

type cdxExtRef struct {
	Type string `json:"type"`
	URL  string `json:"url"`
}

type cdxHash struct {
	Alg     string `json:"alg"`
	Content string `json:"content"`
}

type cdxProperty struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

type cdxVuln struct {
	BOMRef     string         `json:"bom-ref,omitempty"`
	ID         string         `json:"id"`
	Source     cdxVulnSource  `json:"source"`
	Ratings    []cdxRating    `json:"ratings,omitempty"`
	Description string         `json:"description,omitempty"`
	Affects    []cdxAffects   `json:"affects"`
	Recommendation string      `json:"recommendation,omitempty"`
	References []cdxExtRef    `json:"advisories,omitempty"`
}

type cdxVulnSource struct {
	Name string `json:"name"`
	URL  string `json:"url,omitempty"`
}

type cdxRating struct {
	Source   cdxVulnSource `json:"source"`
	Score    *float64      `json:"score,omitempty"`
	Severity string        `json:"severity"`
	Method   string        `json:"method,omitempty"`
	Vector   string        `json:"vector,omitempty"`
}

type cdxAffects struct {
	Ref      string       `json:"ref"`
	Versions []cdxVersion `json:"versions,omitempty"`
}

type cdxVersion struct {
	Version string `json:"version,omitempty"`
	Range   string `json:"range,omitempty"`
	Status  string `json:"status,omitempty"`
}

type cdxBOM struct {
	BOMFormat    string         `json:"bomFormat"`
	SpecVersion  string         `json:"specVersion"`
	SerialNumber string         `json:"serialNumber"`
	Version      int            `json:"version"`
	Metadata     cdxMetadata    `json:"metadata"`
	Components   []cdxComponent `json:"components"`
	Vulnerabilities []cdxVuln   `json:"vulnerabilities,omitempty"`
}

type cdxMetadata struct {
	Timestamp string          `json:"timestamp"`
	Tools     []cdxToolWrap   `json:"tools"`
	Component *cdxComponent   `json:"component,omitempty"`
	Properties []cdxProperty `json:"properties,omitempty"`
}

type cdxToolWrap struct {
	Vendor  string `json:"vendor"`
	Name    string `json:"name"`
	Version string `json:"version"`
}

func RenderCycloneDX(req Request, components []Component, vulns []VulnerabilityRef) (string, error) {
	bom := cdxBOM{
		BOMFormat:    "CycloneDX",
		SpecVersion:  "1.6",
		SerialNumber: "urn:uuid:" + req.ScanID,
		Version:      1,
		Metadata: cdxMetadata{
			Timestamp: time.Now().UTC().Format(time.RFC3339),
			Tools: []cdxToolWrap{{
				Vendor:  "Sentinel",
				Name:    "sentinel-scanner",
				Version: Version,
			}},
			Properties: []cdxProperty{
				{Name: "sentinel:project_id", Value: req.ProjectID},
				{Name: "sentinel:scan_id", Value: req.ScanID},
				{Name: "sentinel:git_ref", Value: req.GitRef},
				{Name: "sentinel:commit_sha", Value: req.CommitSHA},
				{Name: "sentinel:kind", Value: req.Kind},
			},
		},
		Components: make([]cdxComponent, 0, len(components)),
	}

	for _, c := range components {
		cc := cdxComponent{
			BOMRef:  c.Purl,
			Type:    mapCdxType(c.Ecosystem),
			Name:    c.Name,
			Version: c.Version,
			Purl:    c.Purl,
			CPE:     c.CPE,
		}
		if c.Supplier != "" {
			cc.Supplier = &cdxSupplier{Name: c.Supplier}
		}
		if c.License != "" {
			var lic cdxLicense
			lic.License.ID = c.License
			cc.Licenses = []cdxLicense{lic}
		}
		if c.SourceURL != "" {
			cc.ExternalRefs = append(cc.ExternalRefs, cdxExtRef{Type: "distribution", URL: c.SourceURL})
		}
		if c.HashSha256 != "" {
			cc.Hashes = append(cc.Hashes, cdxHash{Alg: "SHA-256", Content: c.HashSha256})
		}
		if c.IsTransitive {
			cc.Properties = append(cc.Properties, cdxProperty{Name: "sentinel:transitive", Value: "true"})
		}
		bom.Components = append(bom.Components, cc)
	}

	for _, v := range vulns {
		ratings := []cdxRating{{
			Source:   cdxVulnSource{Name: "Sentinel"},
			Severity: v.Severity,
			Method:   "CVSSv3.1",
			Vector:   v.CVSSVector,
			Score:    v.CVSSScore,
		}}
		cv := cdxVuln{
			ID:          v.AdvisoryID,
			Source:      cdxVulnSource{Name: "OSV", URL: "https://osv.dev"},
			Ratings:     ratings,
			Description: v.Summary,
			Affects:     []cdxAffects{{Ref: v.ComponentPurl}},
		}
		for _, ref := range v.References {
			cv.References = append(cv.References, cdxExtRef{Type: ref.Type, URL: ref.URL})
		}
		bom.Vulnerabilities = append(bom.Vulnerabilities, cv)
	}

	b, err := json.MarshalIndent(bom, "", "  ")
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func mapCdxType(e Ecosystem) string {
	switch e {
	case EcosystemContainer:
		return "container"
	case EcosystemMLModel, EcosystemDataset:
		return "machine-learning-model"
	default:
		return "library"
	}
}
