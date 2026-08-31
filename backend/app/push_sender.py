"""Background sender for "rest timer done" Web Push notifications.

`reminder_loop()` is started once from app.main's lifespan. Every couple of
seconds it looks for `push_reminders` rows whose `fire_at` has passed, sends a
Web Push to each of that user's devices, and deletes the row. Dead subscriptions
(HTTP 404 / 410 from the push service) are pruned.

Everything here is a no-op when the VAPID keys aren't configured, so it's safe to
run unconditionally. It assumes a SINGLE api process -- running uvicorn with
--workers would send each reminder once per worker.
"""
import asyncio
import json

from sqlalchemy import func

from .config import settings
from .database import SessionLocal
from .models import PushReminder, PushSubscription

_POLL_SECONDS = 2

_NOTIFICATION = {
    "title": "Rest over",
    "body": "Time for your next set.",
    "tag": "rest-timer",
}


def _push_enabled() -> bool:
    return bool(settings.vapid_public_key and settings.vapid_private_key)


def _send_due_reminders() -> None:
    """One synchronous pass: send every reminder that's due. Runs in a worker
    thread (see reminder_loop) because pywebpush does blocking HTTP."""
    from pywebpush import WebPushException, webpush  # imported lazily

    with SessionLocal() as db:
        due = (
            db.query(PushReminder)
            .filter(PushReminder.fire_at <= func.now())
            .all()
        )
        if not due:
            return

        for reminder in due:
            subs = (
                db.query(PushSubscription)
                .filter(PushSubscription.user_id == reminder.user_id)
                .all()
            )
            for sub in subs:
                try:
                    webpush(
                        subscription_info={
                            "endpoint": sub.endpoint,
                            "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
                        },
                        data=json.dumps(_NOTIFICATION),
                        vapid_private_key=settings.vapid_private_key,
                        vapid_claims={"sub": settings.vapid_subject},
                        ttl=120,
                    )
                except WebPushException as exc:
                    status = getattr(exc.response, "status_code", None)
                    if status in (404, 410):
                        db.delete(sub)   # subscription is gone for good
                    else:
                        print(f"[push] send failed ({status}): {exc}")
                except Exception as exc:  # noqa: BLE001 -- never let one send kill the loop
                    print(f"[push] unexpected send error: {exc}")

            db.delete(reminder)

        db.commit()


async def reminder_loop() -> None:
    if not _push_enabled():
        print("[push] VAPID keys not set -- rest-timer notifications disabled.")
        return

    print("[push] rest-timer notification sender started.")
    while True:
        await asyncio.sleep(_POLL_SECONDS)
        try:
            await asyncio.to_thread(_send_due_reminders)
        except Exception as exc:  # noqa: BLE001 -- keep the loop alive no matter what
            print(f"[push] reminder loop error: {exc}")
