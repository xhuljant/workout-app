# Backend container image.

FROM python:3.12.8-slim

# PYTHONUNBUFFERED     -> logs appear immediately instead of being buffered.
# PYTHONDONTWRITEBYTECODE -> don't litter the image with .pyc files.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# Install dependencies FIRST and in their own layer. Docker caches this layer, so
# rebuilds are fast as long as requirements.txt hasn't changed.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Now copy the rest of the code (the "app" package, "alembic" migrations,
# "alembic.ini", the "static" folder, and entrypoint.sh).
COPY . .

RUN chmod +x /app/entrypoint.sh

# entrypoint.sh runs `alembic upgrade head` (bringing the schema up to date), then
# execs the CMD below. Schema changes are migrations now -- never `down -v`.
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
