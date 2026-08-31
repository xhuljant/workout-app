"""Web Push routes: opt in/out of "rest timer done" notifications, and register
the single pending reminder for the current rest countdown.

Mounted under /api/push. Every route requires a valid access token and only
touches the caller's own rows. Push is OPTIONAL -- when the VAPID keys aren't
configured (settings.vapid_public_key / vapid_private_key), /vapid-key returns
404, so the client never subscribes and the background sender in app.main stays
idle.
"""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..deps import get_current_user
from ..models import PushReminder, PushSubscription, User
from ..schemas import PushReminderIn, PushSubscriptionIn, PushUnsubscribeIn

router = APIRouter(prefix="/api/push", tags=["push"])

# A rest timer is minutes, not hours -- refuse anything absurd so a client bug
# can't park a reminder days into the future.
_MAX_REMINDER_AHEAD = timedelta(hours=2)


def _push_enabled() -> bool:
    return bool(settings.vapid_public_key and settings.vapid_private_key)


@router.get("/vapid-key")
def vapid_key(_: User = Depends(get_current_user)):
    """The VAPID public key the client needs for pushManager.subscribe(). 404
    when push isn't configured -- the client treats that as "feature off"."""
    if not _push_enabled():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Push not configured.")
    return {"key": settings.vapid_public_key}


@router.post("/subscribe", status_code=status.HTTP_204_NO_CONTENT)
def subscribe(
    body: PushSubscriptionIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Store (or refresh) this device's push subscription. Keyed by endpoint, so
    re-subscribing the same device just updates its keys / owner."""
    row = (
        db.query(PushSubscription)
        .filter(PushSubscription.endpoint == body.endpoint)
        .first()
    )
    if row is None:
        row = PushSubscription(endpoint=body.endpoint)
        db.add(row)
    row.user_id = user.id
    row.p256dh = body.keys.p256dh
    row.auth = body.keys.auth
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/unsubscribe", status_code=status.HTTP_204_NO_CONTENT)
def unsubscribe(
    body: PushUnsubscribeIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    db.query(PushSubscription).filter(
        PushSubscription.user_id == user.id,
        PushSubscription.endpoint == body.endpoint,
    ).delete()
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/reminder", status_code=status.HTTP_204_NO_CONTENT)
def set_reminder(
    body: PushReminderIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Arm the "rest is over" push for the current countdown, replacing any
    previous one. No-op (still 204) when push isn't configured."""
    if not _push_enabled():
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    fire_at = body.fire_at
    if fire_at.tzinfo is None:
        fire_at = fire_at.replace(tzinfo=timezone.utc)
    now = datetime.now(timezone.utc)
    if fire_at > now + _MAX_REMINDER_AHEAD:
        raise HTTPException(status_code=422, detail="Reminder too far in the future.")

    row = db.get(PushReminder, user.id)
    if row is None:
        row = PushReminder(user_id=user.id)
        db.add(row)
    row.fire_at = fire_at
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/reminder", status_code=status.HTTP_204_NO_CONTENT)
def clear_reminder(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    db.query(PushReminder).filter(PushReminder.user_id == user.id).delete()
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
