"""Pydantic schemas: the shapes of data coming IN (requests) and going OUT (responses).

FastAPI uses these to:
  - validate and parse incoming JSON automatically (bad input -> a clear 422 error),
  - and to serialize responses.

Keeping schemas separate from the database models is a deliberate safety habit:
the API physically cannot return a field (like password_hash) unless we list it here.
"""
import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, ConfigDict


class UserCreate(BaseModel):
    """Body for POST /api/auth/register."""
    email: EmailStr                                  # validated as an email address
    display_name: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=8, max_length=128)


class UserLogin(BaseModel):
    """Body for POST /api/auth/login."""
    email: EmailStr
    password: str


class UserPublic(BaseModel):
    """A safe, public view of a user. Note there is no password field of any kind."""
    id: uuid.UUID
    email: EmailStr
    display_name: str
    preferences: dict = Field(default_factory=dict)
    created_at: datetime

    # from_attributes=True lets Pydantic build this straight from a SQLAlchemy
    # User object (reading user.id, user.email, ... by attribute).
    model_config = ConfigDict(from_attributes=True)


class UserUpdate(BaseModel):
    """Body for PATCH /api/auth/me. Every field optional -- only what's sent changes."""
    display_name: str | None = Field(default=None, min_length=1, max_length=100)
    email: EmailStr | None = None
    preferences: dict | None = None


class PasswordChange(BaseModel):
    """Body for POST /api/auth/change-password."""
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class Token(BaseModel):
    """Returned by register / login / refresh."""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    """Body for POST /api/auth/refresh."""
    refresh_token: str


# --- Exercises ---------------------------------------------------------------

class ExerciseCreate(BaseModel):
    """Body for POST /api/exercises. Only the name is required; the rest mirror
    the fields in the seeded public library and are all optional."""
    name: str = Field(min_length=1, max_length=200)
    category: str | None = Field(default=None, max_length=100)
    equipment: str | None = Field(default=None, max_length=100)
    primary_muscles: list[str] = Field(default_factory=list)
    instructions: list[str] = Field(default_factory=list)


class ExercisePublic(BaseModel):
    """A single exercise as returned by the API."""
    id: uuid.UUID
    name: str
    category: str | None
    equipment: str | None
    force: str | None
    level: str | None
    mechanic: str | None
    primary_muscles: list[str]
    secondary_muscles: list[str]
    instructions: list[str]
    is_custom: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# --- Workouts --------------------------------------------------------------

class WorkoutSet(BaseModel):
    """One set. weight/reps stay optional so a half-filled row still saves."""
    weight: float | None = None
    reps: int | None = None
    done: bool = False
    # Set by the client when a completed set beats the user's previous best for
    # that exercise. Stored in content so History can show the 🏆 too.
    pr_weight: bool = False
    pr_1rm: bool = False


class WorkoutExerciseEntry(BaseModel):
    """One exercise within a workout, with its sets."""
    exercise_id: uuid.UUID | None = None
    name: str
    notes: str = ""
    sets: list[WorkoutSet] = Field(default_factory=list)


class WorkoutContent(BaseModel):
    """The whole editable body of a workout."""
    exercises: list[WorkoutExerciseEntry] = Field(default_factory=list)


class WorkoutUpdate(BaseModel):
    """Body for PUT /api/workouts/active."""
    content: WorkoutContent


class WorkoutStart(BaseModel):
    """Optional body for POST /api/workouts. At most one of these is set:
    routine_id pre-fills from a routine template; from_workout_id repeats a past
    workout."""
    routine_id: uuid.UUID | None = None
    from_workout_id: uuid.UUID | None = None


class WorkoutPublic(BaseModel):
    """A workout as returned by the API."""
    id: uuid.UUID
    status: str
    routine_id: uuid.UUID | None
    content: WorkoutContent
    started_at: datetime
    finished_at: datetime | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class WorkoutSummary(BaseModel):
    """A finished workout as it appears in the History list (no full set data)."""
    id: uuid.UUID
    routine_id: uuid.UUID | None
    started_at: datetime
    finished_at: datetime | None
    exercise_count: int
    set_count: int          # completed sets only
    volume: float           # sum of weight * reps over completed sets


class ExercisePrevious(BaseModel):
    """Last-time performance + all-time bests for one exercise."""
    last_sets: list[WorkoutSet] = Field(default_factory=list)
    best_weight: float | None = None
    best_1rm: float | None = None


# --- Routines ------------------------------------------------------------

class RoutineSet(BaseModel):
    """One planned set in a routine template (no 'done' -- that's a workout thing)."""
    weight: float | None = None
    reps: int | None = None


class RoutineExerciseEntry(BaseModel):
    exercise_id: uuid.UUID | None = None
    name: str
    sets: list[RoutineSet] = Field(default_factory=list)


class RoutineContent(BaseModel):
    exercises: list[RoutineExerciseEntry] = Field(default_factory=list)


class RoutineCreate(BaseModel):
    """Body for POST /api/routines and PUT /api/routines/{id}."""
    name: str = Field(min_length=1, max_length=200)
    content: RoutineContent


# PUT uses the same shape as create.
RoutineUpdate = RoutineCreate


class RoutineReorder(BaseModel):
    """Body for PUT /api/routines/order -- routine ids in the desired order."""
    ids: list[uuid.UUID]


class RoutinePublic(BaseModel):
    id: uuid.UUID
    name: str
    position: int
    content: RoutineContent
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
