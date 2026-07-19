"""Real OTP delivery over SMTP (e.g. Gmail with an App Password).

This is intentionally a thin wrapper around smtplib rather than a queueing
system - it's a synchronous send that blocks the request for the ~1s a
transactional email takes, which is fine at this scale and keeps the code
easy to follow end to end.
"""

import re
import smtplib
from email.mime.text import MIMEText

from app.config import EMAIL_OTP_ENABLED, SMTP_FROM_NAME, SMTP_HOST, SMTP_PASSWORD, SMTP_PORT, SMTP_USER

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def is_email(identifier: str) -> bool:
    return bool(EMAIL_RE.match(identifier.strip()))


def send_otp_email(to_address: str, otp: str) -> None:
    """Send a real OTP email. Raises on failure - callers should catch and
    surface a clean error rather than silently pretending it sent."""
    subject = f"{otp} is your Signal Clone verification code"
    body = (
        f"Your verification code is: {otp}\n\n"
        "This code expires once used and was requested for the Signal Clone demo app.\n"
        "If you didn't request this, you can ignore this email."
    )
    msg = MIMEText(body)
    msg["Subject"] = subject
    msg["From"] = f"{SMTP_FROM_NAME} <{SMTP_USER}>"
    msg["To"] = to_address

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as server:
        server.ehlo()
        server.starttls()
        server.ehlo()
        server.login(SMTP_USER, SMTP_PASSWORD)
        server.sendmail(SMTP_USER, [to_address], msg.as_string())


def maybe_send_real_otp(identifier: str, otp: str) -> bool:
    """Send a real email if this identifier is an email address and SMTP is
    configured. Returns True if a real email was sent (caller should NOT
    reveal the OTP in the API response in that case)."""
    if EMAIL_OTP_ENABLED and is_email(identifier):
        send_otp_email(identifier, otp)
        return True
    return False
