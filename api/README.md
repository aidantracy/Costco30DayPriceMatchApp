# API

FastAPI backend and scheduled jobs. See [docs/design/architecture.md](../docs/design/architecture.md).

```bash
uv sync                      # install dependencies
uv run pytest --cov          # tests with coverage
uv run ruff check . && uv run ruff format --check .
uv run mypy app
uv run uvicorn app.main:app --reload
```

Local Postgres: `docker compose up -d db` from the repository root, then copy `.env.example` to `.env`.
