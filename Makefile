.PHONY: help install check watch lint typecheck test coverage format format-check architecture audit pack-check release-check hooks-install hooks-check

help: ## List project commands
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z_-]+:.*## / {printf "%-18s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## Install exact locked dependencies
	npm ci

check: ## Run the normal lint, typecheck, and test gate
	@./scripts/normal-gate.sh

watch: ## Run the normal gate on file changes
	fzz watch

lint: ## Run lint checks
	npm run -s lint

typecheck: ## Run TypeScript checks
	npm run -s typecheck

test: ## Run deterministic tests
	npm run -s test

coverage: ## Run tests with coverage thresholds
	npm run -s test:coverage

format: ## Apply formatting
	npm run -s format

format-check: ## Check formatting without changes
	npm run -s format:check

architecture: ## Enforce dependency direction
	@node scripts/check-architecture.mjs

audit: ## Scan dependencies for known high-severity vulnerabilities
	npm run -s audit

pack-check: ## Verify package contents
	npm run -s pack:check

release-check: check format-check architecture coverage audit pack-check ## Run explicit release gates

hooks-install: ## Use the versioned Git hooks
	git config core.hooksPath .githooks
	@$(MAKE) --no-print-directory hooks-check

hooks-check: ## Check hook installation and executable bits
	@./scripts/check-hooks.sh
