"""Database connection and session handling (SQLAlchemy 2.0, synchronous).

We deliberately use the *synchronous* SQLAlchemy API. It's easier to read and
reason about while you're learning Python, and for a couple of users on a home
server there's no performance reason to use async. If we ever need async, we can
switch it later without changing the overall design.
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from .config import settings

# The "engine" is SQLAlchemy's core handle to the database (a pool of connections).
# pool_pre_ping=True quietly checks a pooled connection is still alive before using
# it, which prevents errors right after Postgres restarts.
engine = create_engine(settings.database_url, pool_pre_ping=True)

# A factory that creates new Session objects. We make one Session per web request.
#   autoflush=False   -> we control when pending changes are sent to the DB
#   autocommit=False  -> nothing is saved until we explicitly call db.commit()
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

# Base class that all of our table/model classes inherit from.
Base = declarative_base()


def get_db():
    """FastAPI dependency that provides a database session to a route and always
    closes it afterwards, even if the route raised an error.

    A route uses it like:
        def route(db: Session = Depends(get_db)): ...
    """
    db = SessionLocal()
    try:
        yield db          # hand the session to the route
    finally:
        db.close()        # runs after the response is sent
