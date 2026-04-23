// Package scan contains the SBOM generation engine. It walks a project
// directory, detects manifests per ecosystem, and produces a normalised
// component list plus a CycloneDX 1.6 SBOM document.
package scan

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
)

const Version = "0.1.0"

type EngineConfig struct {
	WorkDir       string
	MaxConcurrent int
}

type Engine struct {
	cfg        EngineConfig
	sem        chan struct{}
	detectors  []Detector
	shutdownMu sync.Mutex
	shutdown   bool
}

func NewEngine(cfg EngineConfig) *Engine {
	if cfg.MaxConcurrent <= 0 {
		cfg.MaxConcurrent = 8
	}
	return &Engine{
		cfg:       cfg,
		sem:       make(chan struct{}, cfg.MaxConcurrent),
		detectors: DefaultDetectors(),
	}
}

type Request struct {
	ProjectID   string
	ScanID      string
	WorkDir     string
	Ecosystems  []string
	GitRef      string
	CommitSHA   string
	Kind        string
	TriggeredBy string
}

type Result struct {
	ScanID         string      `json:"scanId"`
	Status         string      `json:"status"`
	ComponentCount int         `json:"componentCount"`
	Components     []Component `json:"components"`
	Vulnerabilities []VulnerabilityRef `json:"vulnerabilities"`
	SBOMFormat     string      `json:"sbomFormat"`
	SBOMContent    string      `json:"sbomContent"`
	DurationMs     int64       `json:"durationMs"`
	ErrorMessage   string      `json:"errorMessage,omitempty"`
}

func (e *Engine) Scan(ctx context.Context, req Request) (*Result, error) {
	if err := e.acquire(ctx); err != nil {
		return nil, err
	}
	defer e.release()

	if req.ScanID == "" {
		req.ScanID = uuid.NewString()
	}

	start := time.Now()
	logger := log.With().
		Str("scanId", req.ScanID).
		Str("projectId", req.ProjectID).
		Str("workDir", req.WorkDir).
		Logger()

	ecoFilter := newEcosystemFilter(req.Ecosystems)

	allComponents := make([]Component, 0, 128)
	seen := make(map[string]struct{})
	for _, d := range e.detectors {
		if !ecoFilter.allows(string(d.Ecosystem())) {
			continue
		}
		found, err := d.Detect(ctx, req.WorkDir)
		if err != nil {
			logger.Warn().Err(err).Str("ecosystem", string(d.Ecosystem())).Msg("detector failed")
			continue
		}
		for _, c := range found {
			if _, dup := seen[c.Purl]; dup {
				continue
			}
			seen[c.Purl] = struct{}{}
			allComponents = append(allComponents, c)
		}
	}

	// Vulnerability resolution: purely offline today (OSV mirror would plug in
	// here). We include a small built-in catalog so demos produce real findings.
	vulns := resolveVulnerabilities(allComponents)

	cdx, err := RenderCycloneDX(req, allComponents, vulns)
	if err != nil {
		return nil, fmt.Errorf("render SBOM: %w", err)
	}

	result := &Result{
		ScanID:          req.ScanID,
		Status:          "completed",
		ComponentCount:  len(allComponents),
		Components:      allComponents,
		Vulnerabilities: vulns,
		SBOMFormat:      "cyclonedx-1.6",
		SBOMContent:     cdx,
		DurationMs:      time.Since(start).Milliseconds(),
	}

	logger.Info().
		Int("components", len(allComponents)).
		Int("vulnerabilities", len(vulns)).
		Dur("duration", time.Since(start)).
		Msg("scan completed")

	return result, nil
}

func (e *Engine) acquire(ctx context.Context) error {
	e.shutdownMu.Lock()
	if e.shutdown {
		e.shutdownMu.Unlock()
		return errors.New("engine shutting down")
	}
	e.shutdownMu.Unlock()

	select {
	case e.sem <- struct{}{}:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (e *Engine) release() {
	<-e.sem
}

// ecosystemFilter is a small closure helper; empty list means "everything".
type ecosystemFilter struct {
	allowed map[string]struct{}
}

func newEcosystemFilter(list []string) ecosystemFilter {
	if len(list) == 0 {
		return ecosystemFilter{allowed: nil}
	}
	m := make(map[string]struct{}, len(list))
	for _, s := range list {
		m[s] = struct{}{}
	}
	return ecosystemFilter{allowed: m}
}

func (f ecosystemFilter) allows(e string) bool {
	if f.allowed == nil {
		return true
	}
	_, ok := f.allowed[e]
	return ok
}
