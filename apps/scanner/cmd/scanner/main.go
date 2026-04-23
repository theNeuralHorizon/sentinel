// Package main starts the Sentinel scanner HTTP service.
// The service accepts scan requests over REST and produces a CycloneDX 1.6 SBOM
// plus a list of normalised Sentinel components. It is designed to be stateless
// so it can scale horizontally behind a load balancer.
package main

import (
	"context"
	"errors"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"

	"github.com/theNeuralHorizon/sentinel/apps/scanner/internal/api"
	"github.com/theNeuralHorizon/sentinel/apps/scanner/internal/scan"
)

func main() {
	// Structured logging. In production we ship via OTel; zerolog JSON is the
	// lowest-friction baseline that any log aggregator understands.
	zerolog.TimeFieldFormat = zerolog.TimeFormatUnix
	logLevel := zerolog.InfoLevel
	if lvl, err := zerolog.ParseLevel(os.Getenv("LOG_LEVEL")); err == nil && lvl != zerolog.NoLevel {
		logLevel = lvl
	}
	zerolog.SetGlobalLevel(logLevel)
	log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr, TimeFormat: time.RFC3339})

	host := getenv("SCANNER_HOST", "0.0.0.0")
	port := getenv("SCANNER_PORT", "4100")
	workDir := getenv("SCANNER_WORK_DIR", "/tmp/sentinel-scans")
	maxConcurrent, _ := strconv.Atoi(getenv("SCANNER_MAX_CONCURRENT", "8"))
	if maxConcurrent <= 0 {
		maxConcurrent = 8
	}

	if err := os.MkdirAll(workDir, 0o755); err != nil {
		log.Fatal().Err(err).Msg("failed to create work dir")
	}

	engine := scan.NewEngine(scan.EngineConfig{
		WorkDir:       workDir,
		MaxConcurrent: maxConcurrent,
	})

	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Heartbeat("/healthz"))
	r.Use(middleware.Timeout(5 * time.Minute))

	h := api.NewHandlers(engine)
	h.Register(r)

	srv := &http.Server{
		Addr:              host + ":" + port,
		Handler:           r,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       2 * time.Minute,
		WriteTimeout:      5 * time.Minute,
		IdleTimeout:       2 * time.Minute,
	}

	// Graceful shutdown so in-flight scans have a chance to finish.
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	go func() {
		log.Info().Str("addr", srv.Addr).Msg("sentinel-scanner listening")
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatal().Err(err).Msg("http server crashed")
		}
	}()

	<-ctx.Done()
	log.Info().Msg("shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Error().Err(err).Msg("graceful shutdown failed")
	}
}

func getenv(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return fallback
}
