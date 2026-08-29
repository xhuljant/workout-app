# Convenience targets. `make help` lists them.

.PHONY: help up down build logs backup restore migrate revision test

help:
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
	  awk 'BEGIN{FS=":.*?## "}{printf "  %-12s %s\n", $$1, $$2}'

up: ## Start the whole stack (migrations run automatically)
	docker compose up --build

down: ## Stop the stack (does NOT touch the database volume)
	docker compose down

logs: ## Tail the api + db logs
	docker compose logs -f api db

backup: ## Take an immediate database backup into ./backups/
	./scripts/backup.sh

restore: ## Restore from a dump: make restore FILE=backups/xxx.dump
	./scripts/restore.sh "$(FILE)"

migrate: ## Apply any pending migrations against the running db
	docker compose exec api alembic upgrade head

revision: ## Autogenerate a migration: make revision M="add thing"
	docker compose exec api alembic revision --autogenerate -m "$(M)"

test: ## Run the backend test suite (needs a throwaway Postgres on DATABASE_URL)
	cd backend && python -m pytest
