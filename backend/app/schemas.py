"""Pydantic schemas: the shapes of data coming IN (requests) and going OUT (responses).

FastAPI uses these to:
  - validate and parse incoming JSON automatically (bad input -> a clear 422 error),
  - and to serialize responses.

Keeping schemas separate from the database models is a deliberate safety habit:
the API physically cannot return a field (like password_hash) unless we list it here.
"""
import uuid
from datetime import date, datetime

from pydantic import BaseModel, EmailStr, Field, ConfigDict, field_validator


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

_TRACKING_TYPES = {"weight_reps", "reps", "time", "distance_time"}


class ExerciseCreate(BaseModel):
    """Body for POST /api/exercises. Only the name is required; the rest mirror
    the fields in the seeded public library and are all optional."""
    name: str = Field(min_length=1, max_length=200)
    tracking_type: str = "weight_reps"
    category: str | None = Field(default=None, max_length=100)
    equipment: str | None = Field(default=None, max_length=100)
    primary_muscles: list[str] = Field(default_factory=list)
    instructions: list[str] = Field(default_factory=list)

    @field_validator("tracking_type")
    @classmethod
    def _known_tracking(cls, v: str) -> str:
        return v if v in _TRACKING_TYPES else "weight_reps"


class ExercisePublic(BaseModel):
    """A single exercise as returned by the API."""
    id: uuid.UUID
    name: str
    tracking_type: str
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
    """One set. Only the fields the exercise's tracking mode uses are filled;
    all stay optional so a half-entered row still saves."""
    weight: float | None = None
    reps: int | None = None
    seconds: int | None = None
    distance: float | None = None
    done: bool = False
    # Set by the client when a completed set beats the user's previous best for
    # that exercise. Stored in content so History can show the 🏆 too.
    pr_weight: bool = False
    pr_1rm: bool = False
    pr_reps: bool = False
    pr_time: bool = False
    pr_distance: bool = False


class WorkoutExerciseEntry(BaseModel):
    """One exercise within a workout, with its sets."""
    exercise_id: uuid.UUID | None = None
    name: str
    tracking_type: str = "weight_reps"
    notes: str = ""
    sets: list[WorkoutSet] = Field(default_factory=list)


class WorkoutContent(BaseModel):
    """The whole editable body of a workout."""
    exercises: list[WorkoutExerciseEntry] = Field(default_factory=list)


class WorkoutUpdate(BaseModel):
    """Body for PUT /api/workouts/active."""
    content: WorkoutContent
    rest_seconds: int | None = Field(default=None, ge=0, le=3600)


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
    rest_seconds: int | None
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


class WorkoutCalendarEntry(BaseModel):
    """One finished workout as a mark on the Calendar view."""
    id: uuid.UUID
    at: datetime            # finished_at, or started_at if never finished
    name: str               # routine name; "" for ad-hoc (routine-less) workouts


class MeasurementCreate(BaseModel):
    """Body for POST /api/measurements and PUT /api/measurements/{id}.

    `values` are in canonical units (kg / cm / %). PUT sends the full desired
    state, including `photos` -- the complete list of progress photos to keep
    (up to 4), each a base64 data URL.
    """
    measured_on: date
    values: dict[str, float] = Field(default_factory=dict)
    photos: list[str] = Field(default_factory=list, max_length=4)


MeasurementUpdate = MeasurementCreate


class MeasurementListItem(BaseModel):
    """A measurement entry as it appears in the history list / graph feed --
    everything except the (potentially large) photo blobs."""
    id: uuid.UUID
    measured_on: date
    values: dict[str, float]
    photo_count: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class MeasurementPublic(MeasurementListItem):
    """A single entry in full, including its progress photos."""
    photos: list[str]


class ExercisePrevious(BaseModel):
    """Last-time performance + all-time bests for one exercise."""
    last_sets: list[WorkoutSet] = Field(default_factory=list)
    best_weight: float | None = None
    best_1rm: float | None = None
    best_reps: int | None = None
    best_seconds: int | None = None
    best_distance: float | None = None


class ExerciseSessionStat(BaseModel):
    """One finished workout's numbers for a given exercise."""
    workout_id: uuid.UUID
    date: datetime
    top_weight: float | None = None
    top_reps: int | None = None
    top_seconds: int | None = None
    top_distance: float | None = None
    best_1rm: float | None = None
    volume: float = 0.0


class ExerciseStats(BaseModel):
    """Everything the exercise detail screen shows for one exercise."""
    tracking_type: str = "weight_reps"
    performed_count: int = 0
    last_performed: datetime | None = None
    # weight_reps
    heaviest_weight: float | None = None
    heaviest_weight_reps: int | None = None
    most_reps: int | None = None
    most_reps_weight: float | None = None
    best_1rm: float | None = None
    best_session_volume: float | None = None
    total_volume: float = 0.0
    # reps / time / distance_time
    total_reps: int | None = None
    longest_seconds: int | None = None
    total_seconds: int | None = None
    farthest_distance: float | None = None
    total_distance: float | None = None
    best_pace: float | None = None   # seconds per mile
    sessions: list[ExerciseSessionStat] = Field(default_factory=list)


# --- Routines ------------------------------------------------------------

class RoutineSet(BaseModel):
    """One planned set in a routine template (no 'done' -- that's a workout thing)."""
    weight: float | None = None
    reps: int | None = None
    seconds: int | None = None
    distance: float | None = None


class RoutineExerciseEntry(BaseModel):
    exercise_id: uuid.UUID | None = None
    name: str
    tracking_type: str = "weight_reps"
    sets: list[RoutineSet] = Field(default_factory=list)


class RoutineContent(BaseModel):
    exercises: list[RoutineExerciseEntry] = Field(default_factory=list)


class RoutineCreate(BaseModel):
    """Body for POST /api/routines and PUT /api/routines/{id}."""
    name: str = Field(min_length=1, max_length=200)
    content: RoutineContent
    folder_id: uuid.UUID | None = None
    rest_seconds: int | None = Field(default=None, ge=0, le=3600)


# PUT uses the same shape as create.
RoutineUpdate = RoutineCreate


class RoutineReorder(BaseModel):
    """Body for PUT /api/routines/order -- routine ids in the desired order,
    within one folder."""
    folder_id: uuid.UUID
    ids: list[uuid.UUID]


class RoutinePublic(BaseModel):
    id: uuid.UUID
    name: str
    position: int
    folder_id: uuid.UUID | None
    rest_seconds: int | None
    content: RoutineContent
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# --- Folders -----------------------------------------------------------

class FolderCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class FolderUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    collapsed: bool | None = None


class FolderReorder(BaseModel):
    """Body for PUT /api/folders/order -- custom folders in the desired order."""
    ids: list[uuid.UUID]


class FolderPublic(BaseModel):
    id: uuid.UUID
    name: str
    position: int
    collapsed: bool
    is_default: bool

    model_config = ConfigDict(from_attributes=True)
