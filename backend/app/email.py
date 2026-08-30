"""Outbound email.

Synchronous on purpose -- it matches the rest of the app (see database.py). There
are two senders:

  - SmtpEmailSender    : real delivery via stdlib smtplib. Used when SMTP_HOST is
                         configured.
  - ConsoleEmailSender : writes the whole message (including any link) to the
                         server log at WARNING. The dev / unconfigured fallback.

`get_email_sender()` is a FastAPI dependency returning a process-wide singleton;
tests swap it out with `app.dependency_overrides`.
"""
from __future__ import annotations

import logging
import smtplib
import ssl
from email.message import EmailMessage
from functools import lru_cache
from typing import Protocol

from .config import settings

logger = logging.getLogger("app.email")


class EmailSender(Protocol):
    def send(self, *, to: str, subject: str, body: str) -> None: ...


class ConsoleEmailSender:
    """No SMTP configured -- log the message so a developer can still follow the
    link. Never used when SMTP_HOST is set."""

    def send(self, *, to: str, subject: str, body: str) -> None:
        logger.warning(
            "EMAIL NOT SENT (no SMTP configured). to=%s subject=%r\n%s",
            to, subject, body,
        )


class SmtpEmailSender:
    def __init__(self) -> None:
        self._host = settings.smtp_host
        self._port = settings.smtp_port
        self._user = settings.smtp_user
        self._password = settings.smtp_password
        self._from = settings.smtp_from
        self._tls = settings.smtp_tls
        self._timeout = settings.smtp_timeout

    def send(self, *, to: str, subject: str, body: str) -> None:
        msg = EmailMessage()
        msg["From"] = self._from
        msg["To"] = to
        msg["Subject"] = subject
        msg.set_content(body)

        with smtplib.SMTP(self._host, self._port, timeout=self._timeout) as smtp:
            if self._tls:
                smtp.starttls(context=ssl.create_default_context())
            if self._user and self._password:
                smtp.login(self._user, self._password)
            smtp.send_message(msg)


@lru_cache(maxsize=1)
def _sender_singleton() -> EmailSender:
    if settings.smtp_host:
        return SmtpEmailSender()
    return ConsoleEmailSender()


def get_email_sender() -> EmailSender:
    """FastAPI dependency. Tests override this via app.dependency_overrides."""
    return _sender_singleton()


# --- Higher-level helpers ---------------------------------------------------

def build_reset_url(raw_token: str) -> str:
    """The link that goes in the reset email.

    It's a query param on "/", not a dedicated path: the SPA is served by
    StaticFiles(html=True), which only returns index.html for "/" -- any other
    path would 404. app.js reads ?reset_token=... on load and strips it from the
    address bar.
    """
    base = settings.app_base_url.rstrip("/")
    return f"{base}/?reset_token={raw_token}"


def send_password_reset_email(sender: EmailSender, *, to: str, raw_token: str) -> None:
    """Compose + send the reset email. Called from a BackgroundTask so a slow or
    failing SMTP server never blocks (or changes the timing of) the HTTP
    response. Any error is logged and swallowed."""
    url = build_reset_url(raw_token)
    minutes = settings.password_reset_token_expire_minutes
    body = (
        "We received a request to reset the password for your Workout Log "
        "account.\n\n"
        f"Reset it here (link valid for {minutes} minutes):\n{url}\n\n"
        "If you didn't ask for this you can ignore this email -- your password "
        "hasn't changed.\n"
    )
    try:
        sender.send(to=to, subject="Reset your Workout Log password", body=body)
    except Exception:  # noqa: BLE001 -- must never surface to the caller
        logger.exception("Failed to send password reset email to %s", to)
