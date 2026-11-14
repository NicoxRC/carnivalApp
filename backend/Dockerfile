# The backend packaged with everything it needs to run. Railway runs this image.
#
#   docker build -t sigue-el-desfile-backend backend/
#   docker run --rm -p 8000:8000 -e DATABASE_URL=... -e JWT_SECRET=... sigue-el-desfile-backend
#
# Two stages: the first installs the dependencies with uv, the second takes
# only the result, so the final image carries neither uv nor its cache.

FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS build

WORKDIR /app
# Compiled ahead so the first request does not pay for it; copied, not
# linked, because the cache does not travel to the final image.
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

# Only what defines the dependencies: this layer is reused until they change.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project


FROM python:3.12-slim-bookworm

# Not root: whoever breaks into the process does not own the container.
RUN useradd --create-home --uid 10001 app

WORKDIR /app
COPY --from=build /app/.venv /app/.venv
COPY alembic.ini ./
COPY migrations/ migrations/
COPY seed/ seed/
COPY app/ app/

# Where photos go when there is no bucket (app/storage.py).
RUN mkdir /app/.photos && chown app:app /app/.photos

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PORT=8000
USER app
EXPOSE 8000

# Railway sets PORT. `exec` so the server gets the stop signal and can close
# its connections. Migrations are a separate step: `alembic upgrade head`.
CMD ["sh", "-c", "exec fastapi run --host 0.0.0.0 --port ${PORT}"]
