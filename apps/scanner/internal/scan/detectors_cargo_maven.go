// Cargo (Cargo.toml / Cargo.lock) + Maven (pom.xml) detectors.
// Kept in their own file so the core `detectors.go` doesn't balloon.
package scan

import (
	"context"
	"encoding/xml"
	"errors"
	"fmt"
	"io/fs"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// ---------------- Cargo ----------------------------------------------------

type cargoDetector struct{}

func (*cargoDetector) Ecosystem() Ecosystem { return EcosystemCargo }

// Cargo.lock is plain TOML but we only need name/version pairs, so a tiny
// state machine is more robust than pulling in a full TOML parser.
func (d *cargoDetector) Detect(_ context.Context, root string) ([]Component, error) {
	lock := filepath.Join(root, "Cargo.lock")
	b, err := os.ReadFile(lock)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return nil, nil
		}
		return nil, fmt.Errorf("read Cargo.lock: %w", err)
	}

	var (
		out        []Component
		inPackage  bool
		curName    string
		curVersion string
	)
	commit := func() {
		if curName != "" && curVersion != "" {
			out = append(out, Component{
				Ecosystem: EcosystemCargo,
				Name:      curName,
				Version:   curVersion,
				Purl:      fmt.Sprintf("pkg:cargo/%s@%s", url.PathEscape(curName), url.PathEscape(curVersion)),
			})
		}
		curName, curVersion = "", ""
	}

	for _, raw := range strings.Split(string(b), "\n") {
		line := strings.TrimSpace(raw)
		if strings.HasPrefix(line, "[[package]]") {
			if inPackage {
				commit()
			}
			inPackage = true
			continue
		}
		if strings.HasPrefix(line, "[") && inPackage {
			commit()
			inPackage = false
			continue
		}
		if !inPackage {
			continue
		}
		if strings.HasPrefix(line, "name = ") {
			curName = strings.Trim(strings.TrimPrefix(line, "name = "), `"`)
		} else if strings.HasPrefix(line, "version = ") {
			curVersion = strings.Trim(strings.TrimPrefix(line, "version = "), `"`)
		}
	}
	if inPackage {
		commit()
	}
	return out, nil
}

// ---------------- Maven ----------------------------------------------------

type mavenDetector struct{}

func (*mavenDetector) Ecosystem() Ecosystem { return EcosystemMaven }

type mavenPom struct {
	XMLName      xml.Name `xml:"project"`
	Dependencies struct {
		Dependency []mavenDep `xml:"dependency"`
	} `xml:"dependencies"`
}

type mavenDep struct {
	GroupID    string `xml:"groupId"`
	ArtifactID string `xml:"artifactId"`
	Version    string `xml:"version"`
	Scope      string `xml:"scope"`
}

var mavenPropRef = regexp.MustCompile(`\$\{[^}]+\}`)

func (d *mavenDetector) Detect(_ context.Context, root string) ([]Component, error) {
	path := filepath.Join(root, "pom.xml")
	b, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return nil, nil
		}
		return nil, fmt.Errorf("read pom.xml: %w", err)
	}
	var pom mavenPom
	if err := xml.Unmarshal(b, &pom); err != nil {
		return nil, fmt.Errorf("parse pom.xml: %w", err)
	}
	out := make([]Component, 0, len(pom.Dependencies.Dependency))
	for _, dep := range pom.Dependencies.Dependency {
		if dep.GroupID == "" || dep.ArtifactID == "" {
			continue
		}
		// Property substitution (${x}) isn't resolved here — record a literal.
		// Advisory matching still works off the name alone.
		version := dep.Version
		if mavenPropRef.MatchString(version) || version == "" {
			version = "managed"
		}
		purl := fmt.Sprintf("pkg:maven/%s/%s@%s",
			url.PathEscape(dep.GroupID),
			url.PathEscape(dep.ArtifactID),
			url.PathEscape(version),
		)
		out = append(out, Component{
			Ecosystem: EcosystemMaven,
			Name:      dep.ArtifactID,
			Version:   version,
			Purl:      purl,
			Supplier:  dep.GroupID,
		})
	}
	return out, nil
}
