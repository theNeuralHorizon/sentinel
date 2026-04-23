# Sentinel Makefile — the subset of commands everyone actually uses.
# Run `make help` for a list.

.DEFAULT_GOAL := help

# --- Colours for the banner
C_RESET = \033[0m
C_BOLD  = \033[1m
C_DIM   = \033[2m
C_CYAN  = \033[36m
C_GREEN = \033[32m

# --- Variables
COMPOSE ?= docker compose
BUN     ?= bun
GO      ?= go

.PHONY: help
help: ## Show this help.
	@printf "$(C_BOLD)Sentinel$(C_RESET) $(C_DIM)— AI-native supply chain security$(C_RESET)\n\n"
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  $(C_CYAN)%-18s$(C_RESET) %s\n", $$1, $$2}' $(MAKEFILE_LIST)

# --- Local stack --------------------------------------------------------------

.PHONY: up
up: ## Bring up the full stack with Docker Compose.
	$(COMPOSE) up -d

.PHONY: down
down: ## Tear down the stack (keep volumes).
	$(COMPOSE) down

.PHONY: nuke
nuke: ## Tear down and WIPE volumes. Loses all data.
	$(COMPOSE) down -v

.PHONY: logs
logs: ## Tail logs from all services.
	$(COMPOSE) logs -f

.PHONY: ps
ps: ## Show container status.
	$(COMPOSE) ps

# --- Schema + seed ------------------------------------------------------------

.PHONY: migrate
migrate: ## Apply the initial SQL schema.
	$(COMPOSE) exec -T postgres psql -U sentinel -d sentinel \
		< packages/db/migrations/0000_init.sql

.PHONY: seed
seed: ## Seed three demo projects, three policies, four CVEs.
	$(BUN) run scripts/seed.ts

.PHONY: reset
reset: nuke up ## Nuke + recreate everything (destructive, confirmation not prompted).
	@sleep 5
	$(MAKE) migrate
	$(MAKE) seed

# --- Tests --------------------------------------------------------------------

.PHONY: test
test: test-ts test-go ## Run all tests.

.PHONY: test-ts
test-ts: ## Run Bun unit tests.
	$(BUN) test

.PHONY: test-go
test-go: ## Run Go scanner tests.
	cd apps/scanner && $(GO) test ./...

.PHONY: typecheck
typecheck: ## Typecheck every workspace package.
	(cd packages/shared && $(BUN) x tsc --noEmit)
	(cd packages/ai      && $(BUN) x tsc --noEmit)
	(cd packages/db      && $(BUN) x tsc --noEmit)
	(cd apps/api         && $(BUN) x tsc --noEmit)
	(cd apps/analyzer    && $(BUN) x tsc --noEmit)
	(cd apps/cli         && $(BUN) x tsc --noEmit)

.PHONY: smoke
smoke: ## Run the end-to-end smoke script against the local API.
	bash scripts/smoke.sh

.PHONY: check
check: typecheck test ## Full pre-push check: typecheck + all tests.

# --- Scanner helpers ----------------------------------------------------------

.PHONY: scanner-run
scanner-run: ## Run the Go scanner service locally on :4100.
	cd apps/scanner && $(GO) run ./cmd/scanner

.PHONY: api-dev
api-dev: ## Run the API with hot reload.
	$(BUN) --cwd apps/api dev

.PHONY: analyzer-dev
analyzer-dev: ## Run the analyzer with hot reload.
	$(BUN) --cwd apps/analyzer dev

.PHONY: web-dev
web-dev: ## Run the SvelteKit dashboard with HMR.
	$(BUN) --cwd apps/web dev

# --- Release ------------------------------------------------------------------

.PHONY: tag
tag: ## Create and push a git tag from the version in CHANGELOG.md (TAG=v0.2.0).
	@test -n "$(TAG)" || (echo "usage: make tag TAG=v0.X.Y"; exit 2)
	git tag -a $(TAG) -m "Sentinel $(TAG)"
	git push origin $(TAG)
