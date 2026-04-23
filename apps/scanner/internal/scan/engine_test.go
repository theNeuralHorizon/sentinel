package scan

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func writeFile(t *testing.T, dir, name, content string) {
	t.Helper()
	path := filepath.Join(dir, name)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestEngineNpm(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "package-lock.json", `{
      "packages": {
        "": {"version": "1.0.0"},
        "node_modules/lodash": {"version": "4.17.11", "license": "MIT"}
      }
    }`)
	engine := NewEngine(EngineConfig{WorkDir: dir, MaxConcurrent: 2})
	result, err := engine.Scan(context.Background(), Request{
		ProjectID: "proj-1",
		WorkDir:   dir,
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Components) != 1 {
		t.Fatalf("expected 1 component, got %d", len(result.Components))
	}
	if result.Components[0].Name != "lodash" {
		t.Fatalf("expected lodash, got %s", result.Components[0].Name)
	}
	if len(result.Vulnerabilities) == 0 {
		t.Fatalf("expected lodash@4.17.11 to match catalog")
	}
}

func TestEnginePyPI(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "requirements.txt", "PyYAML==5.3.1\nrequests==2.30.0\n")
	engine := NewEngine(EngineConfig{WorkDir: dir, MaxConcurrent: 2})
	result, err := engine.Scan(context.Background(), Request{
		ProjectID: "proj-2",
		WorkDir:   dir,
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Components) != 2 {
		t.Fatalf("expected 2 components, got %d", len(result.Components))
	}
	// Both should trigger advisories.
	if len(result.Vulnerabilities) < 2 {
		t.Fatalf("expected >=2 vulnerabilities, got %d", len(result.Vulnerabilities))
	}
}

func TestEngineGoMod(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "go.mod", `module example.com/app

go 1.22

require (
    golang.org/x/net v0.6.0
    github.com/gin-gonic/gin v1.10.0
)`)
	engine := NewEngine(EngineConfig{WorkDir: dir, MaxConcurrent: 2})
	result, err := engine.Scan(context.Background(), Request{
		ProjectID: "proj-3",
		WorkDir:   dir,
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Components) != 2 {
		t.Fatalf("expected 2 components, got %d", len(result.Components))
	}
	// x/net v0.6.0 is in the catalog.
	found := false
	for _, v := range result.Vulnerabilities {
		if v.AdvisoryID == "GHSA-vvpx-j8f3-3w6h" {
			found = true
		}
	}
	if !found {
		t.Fatal("expected x/net advisory to match")
	}
}

func TestEngineEmptyDir(t *testing.T) {
	dir := t.TempDir()
	engine := NewEngine(EngineConfig{WorkDir: dir, MaxConcurrent: 2})
	result, err := engine.Scan(context.Background(), Request{
		ProjectID: "proj-4",
		WorkDir:   dir,
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Components) != 0 {
		t.Fatalf("expected 0 components, got %d", len(result.Components))
	}
}

func TestCycloneDXValidJSON(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "requirements.txt", "PyYAML==5.3.1\n")
	engine := NewEngine(EngineConfig{WorkDir: dir, MaxConcurrent: 2})
	result, err := engine.Scan(context.Background(), Request{ProjectID: "p", WorkDir: dir})
	if err != nil {
		t.Fatal(err)
	}
	var decoded map[string]any
	if err := json.Unmarshal([]byte(result.SBOMContent), &decoded); err != nil {
		t.Fatalf("SBOM is not valid JSON: %v", err)
	}
	if decoded["bomFormat"] != "CycloneDX" {
		t.Errorf("wrong bomFormat: %v", decoded["bomFormat"])
	}
	if decoded["specVersion"] != "1.6" {
		t.Errorf("wrong specVersion: %v", decoded["specVersion"])
	}
}

func TestMCPDetector(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, ".mcp.json", `{"mcpServers": {"fs": {"command": "node", "version": "0.4.0"}}}`)
	engine := NewEngine(EngineConfig{WorkDir: dir, MaxConcurrent: 2})
	result, err := engine.Scan(context.Background(), Request{ProjectID: "p", WorkDir: dir})
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Components) != 1 {
		t.Fatalf("expected 1 MCP component, got %d", len(result.Components))
	}
	if result.Components[0].Ecosystem != EcosystemMCP {
		t.Errorf("wrong ecosystem: %s", result.Components[0].Ecosystem)
	}
}
