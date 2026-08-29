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
# "alembic.ini", and the "static" folder).
COPY . .

# Bring the schema up to date (`alembic upgrade head` is a no-op on an already
# current database), then start the server. Kept inline -- no entrypoint script --
# so it can't be broken by Windows CRLF line endings or a missing +x bit.
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8000"]
