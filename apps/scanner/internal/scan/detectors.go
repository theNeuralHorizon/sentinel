package scan

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

type Detector interface {
	Ecosystem() Ecosystem
	Detect(ctx context.Context, root string) ([]Component, error)
}

func DefaultDetectors() []Detector {
	return []Detector{
		&npmDetector{},
		&pyPIDetector{},
		&goModDetector{},
		&cargoDetector{},
		&mavenDetector{},
		&mlModelDetector{},
		&mcpDetector{},
	}
}

// ---------------- npm (package.json / package-lock.json v3) ------------------

type npmDetector struct{}

func (*npmDetector) Ecosystem() Ecosystem { return EcosystemNPM }

type npmPackageLock struct {
	Packages map[string]struct {
		Version    string          `json:"version"`
		Resolved   string          `json:"resolved"`
		Integrity  string          `json:"integrity"`
		License    json.RawMessage `json:"license"`
		Dev        bool            `json:"dev"`
		Optional   bool            `json:"optional"`
		Peer       bool            `json:"peer"`
		Dependencies map[string]string `json:"dependencies,omitempty"`
	} `json:"packages"`
}

type npmManifest struct {
	Name    string            `json:"name"`
	Version string            `json:"version"`
	License any               `json:"license,omitempty"`
	Deps    map[string]string `json:"dependencies,omitempty"`
	DevDeps map[string]string `json:"devDependencies,omitempty"`
}

func (d *npmDetector) Detect(_ context.Context, root string) ([]Component, error) {
	components := make([]Component, 0, 32)

	// Prefer package-lock.json for accurate resolved versions.
	lockPath := filepath.Join(root, "package-lock.json")
	if _, err := os.Stat(lockPath); err == nil {
		b, err := os.ReadFile(lockPath)
		if err != nil {
			return nil, err
		}
		var lock npmPackageLock
		if err := json.Unmarshal(b, &lock); err != nil {
			return nil, fmt.Errorf("parse package-lock.json: %w", err)
		}
		rootKey := ""
		for path, pkg := range lock.Packages {
			if path == "" {
				rootKey = ""
				continue
			}
			// package-lock key is "node_modules/foo" or "node_modules/@scope/foo".
			name := strings.TrimPrefix(path, "node_modules/")
			if name == "" {
				continue
			}
			namespace, pkgName := splitScopedName(name)
			purl := buildNpmPurl(namespace, pkgName, pkg.Version)
			c := Component{
				Ecosystem:    EcosystemNPM,
				Name:         pkgName,
				Version:      pkg.Version,
				Purl:         purl,
				SourceURL:    pkg.Resolved,
				HashSha256:   integrityToSHA256(pkg.Integrity),
				License:      parseNpmLicense(pkg.License),
				IsTransitive: path != rootKey,
			}
			components = append(components, c)
		}
		return components, nil
	}

	// Fallback: package.json alone — we only know declared deps, not versions.
	pkgPath := filepath.Join(root, "package.json")
	if _, err := os.Stat(pkgPath); err == nil {
		b, err := os.ReadFile(pkgPath)
		if err != nil {
			return nil, err
		}
		var mf npmManifest
		if err := json.Unmarshal(b, &mf); err != nil {
			return nil, fmt.Errorf("parse package.json: %w", err)
		}
		for name, ver := range mf.Deps {
			ns, pkgName := splitScopedName(name)
			components = append(components, Component{
				Ecosystem:    EcosystemNPM,
				Name:         pkgName,
				Version:      stripSemverRange(ver),
				Purl:         buildNpmPurl(ns, pkgName, stripSemverRange(ver)),
				IsTransitive: false,
			})
		}
	}
	return components, nil
}

func splitScopedName(raw string) (namespace, name string) {
	if strings.HasPrefix(raw, "@") {
		slash := strings.Index(raw, "/")
		if slash > 0 {
			return raw[:slash], raw[slash+1:]
		}
	}
	return "", raw
}

var semverRangePrefix = regexp.MustCompile(`^[^\d]*`)

func stripSemverRange(ver string) string {
	return strings.TrimSpace(semverRangePrefix.ReplaceAllString(ver, ""))
}

func buildNpmPurl(namespace, name, version string) string {
	// Purl spec: namespace is URL-encoded, including the leading @.
	if namespace != "" {
		return fmt.Sprintf("pkg:npm/%s/%s@%s",
			url.PathEscape(namespace), url.PathEscape(name), url.PathEscape(version))
	}
	return fmt.Sprintf("pkg:npm/%s@%s", url.PathEscape(name), url.PathEscape(version))
}

func parseNpmLicense(raw json.RawMessage) string {
	if len(raw) == 0 {
		return ""
	}
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		return s
	}
	var obj struct {
		Type string `json:"type"`
	}
	if err := json.Unmarshal(raw, &obj); err == nil {
		return obj.Type
	}
	return ""
}

func integrityToSHA256(integrity string) string {
	if strings.HasPrefix(integrity, "sha256-") {
		return strings.TrimPrefix(integrity, "sha256-")
	}
	return ""
}

// ---------------- PyPI (requirements.txt / pyproject.toml) -------------------

type pyPIDetector struct{}

func (*pyPIDetector) Ecosystem() Ecosystem { return EcosystemPyPI }

var pipReqLine = regexp.MustCompile(`^([A-Za-z0-9_.\-]+)\s*(?:\[[^\]]*\])?\s*(==|>=|~=|!=)\s*([0-9][^\s;]*)`)

func (d *pyPIDetector) Detect(_ context.Context, root string) ([]Component, error) {
	components := make([]Component, 0, 16)
	candidates := []string{"requirements.txt", "requirements-dev.txt", "requirements/prod.txt"}
	for _, rel := range candidates {
		path := filepath.Join(root, rel)
		b, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		for _, line := range strings.Split(string(b), "\n") {
			line = strings.TrimSpace(line)
			if line == "" || strings.HasPrefix(line, "#") {
				continue
			}
			m := pipReqLine.FindStringSubmatch(line)
			if len(m) != 4 {
				continue
			}
			name := m[1]
			ver := m[3]
			components = append(components, Component{
				Ecosystem: EcosystemPyPI,
				Name:      name,
				Version:   ver,
				Purl:      fmt.Sprintf("pkg:pypi/%s@%s", url.PathEscape(strings.ToLower(name)), url.PathEscape(ver)),
			})
		}
	}
	return components, nil
}

// ---------------- Go modules (go.mod + go.sum) ------------------------------

type goModDetector struct{}

func (*goModDetector) Ecosystem() Ecosystem { return EcosystemGoMod }

var goModRequire = regexp.MustCompile(`^\s*(?:require\s+)?([^\s]+)\s+(v[0-9][^\s]+)\s*(?://.*)?$`)

func (d *goModDetector) Detect(_ context.Context, root string) ([]Component, error) {
	components := make([]Component, 0, 16)
	path := filepath.Join(root, "go.mod")
	b, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return components, nil
		}
		return nil, err
	}
	inRequire := false
	for _, raw := range strings.Split(string(b), "\n") {
		line := strings.TrimSpace(raw)
		if line == "" || strings.HasPrefix(line, "//") {
			continue
		}
		if strings.HasPrefix(line, "require (") {
			inRequire = true
			continue
		}
		if inRequire && line == ")" {
			inRequire = false
			continue
		}
		if !inRequire && !strings.HasPrefix(line, "require ") {
			continue
		}
		m := goModRequire.FindStringSubmatch(line)
		if len(m) != 3 {
			continue
		}
		modulePath := m[1]
		version := m[2]
		// Purl type is "golang" per spec; namespace/name split on last "/".
		lastSlash := strings.LastIndex(modulePath, "/")
		var ns, name string
		if lastSlash > 0 {
			ns = modulePath[:lastSlash]
			name = modulePath[lastSlash+1:]
		} else {
			name = modulePath
		}
		purl := fmt.Sprintf("pkg:golang/%s@%s", url.PathEscape(modulePath), url.PathEscape(version))
		components = append(components, Component{
			Ecosystem: EcosystemGoMod,
			Name:      name,
			Version:   version,
			Purl:      purl,
			Supplier:  ns,
		})
	}
	return components, nil
}

// ---------------- ML Model (sentinel-ai.json manifest) -----------------------
//
// Custom manifest for ML/AI components the user wants Sentinel to track.
// Mirrors the shape of CycloneDX 1.6 ML-BOM but is easier to hand-author.

type mlManifest struct {
	Models []struct {
		Name       string `json:"name"`
		Version    string `json:"version"`
		Supplier   string `json:"supplier,omitempty"`
		License    string `json:"license,omitempty"`
		SourceURL  string `json:"sourceUrl,omitempty"`
	} `json:"models"`
	Datasets []struct {
		Name      string `json:"name"`
		Version   string `json:"version"`
		Supplier  string `json:"supplier,omitempty"`
		License   string `json:"license,omitempty"`
		SourceURL string `json:"sourceUrl,omitempty"`
	} `json:"datasets"`
}

type mlModelDetector struct{}

func (*mlModelDetector) Ecosystem() Ecosystem { return EcosystemMLModel }

func (d *mlModelDetector) Detect(_ context.Context, root string) ([]Component, error) {
	b, err := os.ReadFile(filepath.Join(root, "sentinel-ai.json"))
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return nil, nil
		}
		return nil, err
	}
	var mf mlManifest
	if err := json.Unmarshal(b, &mf); err != nil {
		return nil, fmt.Errorf("parse sentinel-ai.json: %w", err)
	}
	var out []Component
	for _, m := range mf.Models {
		out = append(out, Component{
			Ecosystem: EcosystemMLModel,
			Name:      m.Name,
			Version:   m.Version,
			Purl:      fmt.Sprintf("pkg:huggingface/%s@%s", url.PathEscape(m.Name), url.PathEscape(m.Version)),
			Supplier:  m.Supplier,
			License:   m.License,
			SourceURL: m.SourceURL,
		})
	}
	for _, dset := range mf.Datasets {
		out = append(out, Component{
			Ecosystem: EcosystemDataset,
			Name:      dset.Name,
			Version:   dset.Version,
			Purl:      fmt.Sprintf("pkg:hf-dataset/%s@%s", url.PathEscape(dset.Name), url.PathEscape(dset.Version)),
			Supplier:  dset.Supplier,
			License:   dset.License,
			SourceURL: dset.SourceURL,
		})
	}
	return out, nil
}

// ---------------- MCP servers (.mcp.json / mcp.config.json) ------------------

type mcpDetector struct{}

func (*mcpDetector) Ecosystem() Ecosystem { return EcosystemMCP }

type mcpConfig struct {
	MCPServers map[string]struct {
		Command string            `json:"command"`
		Args    []string          `json:"args,omitempty"`
		Env     map[string]string `json:"env,omitempty"`
		URL     string            `json:"url,omitempty"`
		Version string            `json:"version,omitempty"`
	} `json:"mcpServers"`
}

func (d *mcpDetector) Detect(_ context.Context, root string) ([]Component, error) {
	paths := []string{".mcp.json", "mcp.config.json", ".cursor/mcp.json"}
	var components []Component
	for _, rel := range paths {
		b, err := os.ReadFile(filepath.Join(root, rel))
		if err != nil {
			continue
		}
		var cfg mcpConfig
		if err := json.Unmarshal(b, &cfg); err != nil {
			continue
		}
		for name, srv := range cfg.MCPServers {
			version := srv.Version
			if version == "" {
				version = "unknown"
			}
			components = append(components, Component{
				Ecosystem: EcosystemMCP,
				Name:      name,
				Version:   version,
				Purl:      fmt.Sprintf("pkg:mcp/%s@%s", url.PathEscape(name), url.PathEscape(version)),
				SourceURL: srv.URL,
			})
		}
	}
	return components, nil
}
