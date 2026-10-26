# API

FastAPI backend and scheduled jobs. See [docs/design/architecture.md](../docs/design/architecture.md).

```bash
uv sync                      # install dependencies
uv run pytest --cov          # tests with coverage
uv run ruff check . && uv run ruff format --check .
uv run mypy app
uv run uvicorn app.main:app --reload
```

## Database

Local Postgres: `docker compose up -d db` from the repository root, then copy `.env.example` to `.env`.

```bash
uv run alembic upgrade head                                  # apply migrations
uv run alembic revision --autogenerate -m "describe change"  # new migration after editing app/db/models.py
uv run alembic check                                         # fails if models and migrations differ
```

Database tests start a throwaway Postgres with Docker (testcontainers). To use an existing
database instead, set `TEST_DATABASE_URL`, for example
`postgresql+psycopg://app:change-me@localhost:5432/pricematch_test`. The tests drop and
recreate every table in that database.
