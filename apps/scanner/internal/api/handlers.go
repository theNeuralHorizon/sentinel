// Package api exposes the scanner's HTTP surface.
package api

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/rs/zerolog/log"

	"github.com/theNeuralHorizon/sentinel/apps/scanner/internal/scan"
)

type Handlers struct {
	engine *scan.Engine
}

func NewHandlers(engine *scan.Engine) *Handlers {
	return &Handlers{engine: engine}
}

func (h *Handlers) Register(r chi.Router) {
	r.Get("/", h.root)
	r.Post("/v1/scan", h.scan)
	r.Post("/v1/sbom", h.sbom)
}

func (h *Handlers) root(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"service": "sentinel-scanner",
		"version": scan.Version,
		"ok":      true,
	})
}

type scanRequest struct {
	ProjectID   string   `json:"projectId"`
	ScanID      string   `json:"scanId"`
	WorkDir     string   `json:"workDir"`
	Ecosystems  []string `json:"ecosystems,omitempty"`
	GitRef      string   `json:"gitRef,omitempty"`
	CommitSHA   string   `json:"commitSha,omitempty"`
	Kind        string   `json:"kind,omitempty"`
	TriggeredBy string   `json:"triggeredBy,omitempty"`
}

func (h *Handlers) scan(w http.ResponseWriter, r *http.Request) {
	var req scanRequest
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return
	}
	if strings.TrimSpace(req.WorkDir) == "" {
		writeErr(w, http.StatusBadRequest, "workDir is required")
		return
	}
	if strings.TrimSpace(req.ProjectID) == "" {
		writeErr(w, http.StatusBadRequest, "projectId is required")
		return
	}

	log.Info().
		Str("projectId", req.ProjectID).
		Str("scanId", req.ScanID).
		Str("workDir", req.WorkDir).
		Strs("ecosystems", req.Ecosystems).
		Msg("starting scan")

	result, err := h.engine.Scan(r.Context(), scan.Request{
		ProjectID:   req.ProjectID,
		ScanID:      req.ScanID,
		WorkDir:     req.WorkDir,
		Ecosystems:  req.Ecosystems,
		GitRef:      req.GitRef,
		CommitSHA:   req.CommitSHA,
		Kind:        req.Kind,
		TriggeredBy: req.TriggeredBy,
	})
	if err != nil {
		log.Error().Err(err).Str("scanId", req.ScanID).Msg("scan failed")
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, result)
}

// sbom is a convenience endpoint that only returns the CycloneDX 1.6 doc.
func (h *Handlers) sbom(w http.ResponseWriter, r *http.Request) {
	var req scanRequest
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return
	}
	if strings.TrimSpace(req.WorkDir) == "" {
		writeErr(w, http.StatusBadRequest, "workDir is required")
		return
	}
	result, err := h.engine.Scan(r.Context(), scan.Request{
		ProjectID:  req.ProjectID,
		ScanID:     req.ScanID,
		WorkDir:    req.WorkDir,
		Ecosystems: req.Ecosystems,
		Kind:       "full",
	})
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/vnd.cyclonedx+json; version=1.6")
	_, _ = w.Write([]byte(result.SBOMContent))
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
