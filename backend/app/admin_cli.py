"""Admin command-line tools: reset a password, rename an account, clear a
user's workout history, or delete an account -- straight against the
database, no browser or API token needed.

Run it inside the running `api` container (it already has the app and its
dependencies installed and can reach the database):

    docker compose exec api python -m app.admin_cli list-users
    docker compose exec api python -m app.admin_cli reset-password a@b.com
    docker compose exec api python -m app.admin_cli rename-user a@b.com "New Name"
    docker compose exec api python -m app.admin_cli clear-history a@b.com
    docker compose exec api python -m app.admin_cli delete-account a@b.com

See README.md ("Admin CLI") for the full command reference.

Every command looks a user up by email (case-insensitive, the same way login
does) and only ever touches non-deleted accounts. The two destructive commands
(clear-history, delete-account) print exactly what they're about to do and ask
for confirmation unless --yes is passed, so they're safe to run by hand and
still scriptable.
"""
import argparse
import secrets
import sys

from sqlalchemy import func

from .database import SessionLocal
from .models import Routine, User, Workout
from .routers.auth import _normalize_email
from .security import hash_password


def _find_user(db, email: str) -> User:
    user = (
        db.query(User)
        .filter(
            func.lower(User.email) == _normalize_email(email),
            User.deleted_at.is_(None),
        )
        .first()
    )
    if user is None:
        print(f"No active account with email {email!r}.", file=sys.stderr)
        sys.exit(1)
    return user


def _confirm(prompt: str, assume_yes: bool) -> bool:
    if assume_yes:
        return True
    reply = input(f"{prompt} [y/N] ").strip().lower()
    return reply in ("y", "yes")


def cmd_list_users(args):
    db = SessionLocal()
    try:
        q = db.query(User).filter(User.deleted_at.is_(None)).order_by(User.created_at)
        if args.query:
            like = f"%{args.query.strip().lower()}%"
            q = q.filter(
                func.lower(User.email).like(like) | func.lower(User.display_name).like(like)
            )
        users = q.all()
        if not users:
            print("No matching accounts.")
            return
        for u in users:
            print(f"{u.id}  {u.email:<40}  {u.display_name}")
    finally:
        db.close()


def cmd_reset_password(args):
    db = SessionLocal()
    try:
        user = _find_user(db, args.email)
        new_password = args.password or secrets.token_urlsafe(9)
        if len(new_password) < 8:
            print("Password must be at least 8 characters.", file=sys.stderr)
            sys.exit(1)
        user.password_hash = hash_password(new_password)
        db.commit()
        print(f"Password reset for {user.email}.")
        if not args.password:
            print(f"Temporary password: {new_password}")
    finally:
        db.close()


def cmd_rename_user(args):
    db = SessionLocal()
    try:
        user = _find_user(db, args.email)
        old_name = user.display_name
        new_name = args.new_name.strip()
        if not new_name:
            print("New display name can't be blank.", file=sys.stderr)
            sys.exit(1)
        user.display_name = new_name
        db.commit()
        print(f"Renamed {user.email}: {old_name!r} -> {user.display_name!r}")
    finally:
        db.close()


def cmd_clear_history(args):
    db = SessionLocal()
    try:
        user = _find_user(db, args.email)
        count = (
            db.query(Workout)
            .filter(Workout.user_id == user.id, Workout.deleted_at.is_(None))
            .count()
        )
        if count == 0:
            print(f"{user.email} has no workout history to clear.")
            return
        if not _confirm(
            f"Soft-delete all {count} workout(s) for {user.email}? "
            "(same as deleting them one by one -- recoverable from Trash for 30 days)",
            args.yes,
        ):
            print("Cancelled.")
            return
        db.query(Workout).filter(
            Workout.user_id == user.id, Workout.deleted_at.is_(None)
        ).update(
            {Workout.deleted_at: func.now(), Workout.status: "finished"},
            synchronize_session=False,
        )
        db.commit()
        print(f"Cleared {count} workout(s) for {user.email}.")
    finally:
        db.close()


def cmd_delete_account(args):
    db = SessionLocal()
    try:
        user = _find_user(db, args.email)
        if not _confirm(
            f"Soft-delete the account {user.email} ({user.display_name})? "
            "Its routines and active workout are soft-deleted too; finished "
            "workout history is left in place, orphaned, in case it's needed later.",
            args.yes,
        ):
            print("Cancelled.")
            return
        # Mirrors DELETE /api/auth/me exactly (see routers/auth.py:delete_me).
        now = func.now()
        original_email = user.email
        user.deleted_at = now
        user.email = f"{user.email}.deleted.{user.id}"
        db.query(Routine).filter(
            Routine.user_id == user.id, Routine.deleted_at.is_(None)
        ).update({Routine.deleted_at: now}, synchronize_session=False)
        db.query(Workout).filter(
            Workout.user_id == user.id,
            Workout.status == "active",
            Workout.deleted_at.is_(None),
        ).update({Workout.deleted_at: now}, synchronize_session=False)
        db.commit()
        print(f"Account deleted (soft) for the account formerly at {original_email}.")
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser(
        prog="python -m app.admin_cli",
        description="Admin tools for managing accounts from the command line.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("list-users", help="List (or search) active accounts.")
    p.add_argument("query", nargs="?", help="Filter by email/display name substring.")
    p.set_defaults(func=cmd_list_users)

    p = sub.add_parser("reset-password", help="Set a new password for an account.")
    p.add_argument("email")
    p.add_argument("--password", help="New password (min 8 chars). Omit to generate a random one.")
    p.set_defaults(func=cmd_reset_password)

    p = sub.add_parser("rename-user", help="Change an account's display name.")
    p.add_argument("email")
    p.add_argument("new_name")
    p.set_defaults(func=cmd_rename_user)

    p = sub.add_parser("clear-history", help="Soft-delete all of an account's logged workouts.")
    p.add_argument("email")
    p.add_argument("--yes", action="store_true", help="Skip the confirmation prompt.")
    p.set_defaults(func=cmd_clear_history)

    p = sub.add_parser("delete-account", help="Soft-delete an account (same as the in-app \"Delete account\").")
    p.add_argument("email")
    p.add_argument("--yes", action="store_true", help="Skip the confirmation prompt.")
    p.set_defaults(func=cmd_delete_account)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
