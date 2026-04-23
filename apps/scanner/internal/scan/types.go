package scan

type Ecosystem string

const (
	EcosystemNPM       Ecosystem = "npm"
	EcosystemPyPI      Ecosystem = "pypi"
	EcosystemCargo     Ecosystem = "cargo"
	EcosystemGoMod     Ecosystem = "gomodules"
	EcosystemMaven     Ecosystem = "maven"
	EcosystemContainer Ecosystem = "container"
	EcosystemMLModel   Ecosystem = "ml_model"
	EcosystemDataset   Ecosystem = "dataset"
	EcosystemMCP       Ecosystem = "mcp_server"
	EcosystemOther     Ecosystem = "other"
)

type Component struct {
	Ecosystem         Ecosystem `json:"ecosystem"`
	Name              string    `json:"name"`
	Version           string    `json:"version"`
	Purl              string    `json:"purl"`
	CPE               string    `json:"cpe,omitempty"`
	Supplier          string    `json:"supplier,omitempty"`
	SourceURL         string    `json:"sourceUrl,omitempty"`
	License           string    `json:"license,omitempty"`
	LicenseConfidence string    `json:"licenseConfidence,omitempty"`
	IsTransitive      bool      `json:"isTransitive"`
	DirectDependents  []string  `json:"directDependents,omitempty"`
	HashSha256        string    `json:"hashSha256,omitempty"`
}

type VulnerabilityRef struct {
	ComponentPurl  string     `json:"componentPurl"`
	AdvisoryID     string     `json:"advisoryId"`
	Aliases        []string   `json:"aliases,omitempty"`
	Summary        string     `json:"summary"`
	Details        string     `json:"details,omitempty"`
	Severity       string     `json:"severity"`
	CVSSScore      *float64   `json:"cvssScore,omitempty"`
	CVSSVector     string     `json:"cvssVector,omitempty"`
	EPSSScore      *float64   `json:"epssScore,omitempty"`
	FixedVersions  []string   `json:"fixedVersions,omitempty"`
	AffectedRanges []any      `json:"affectedRanges,omitempty"`
	References     []Reference `json:"references,omitempty"`
	PublishedAt    string     `json:"publishedAt,omitempty"`
	ModifiedAt     string     `json:"modifiedAt,omitempty"`
}

type Reference struct {
	Type string `json:"type"`
	URL  string `json:"url"`
}
