import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./signal_clone.db")
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",") if o.strip()]
MOCK_OTP = os.getenv("MOCK_OTP", "123456")

# --- Real email OTP delivery (optional) ---
# If SMTP_USER/SMTP_PASSWORD are set, registering with an email address sends
# a real, randomly generated OTP through this SMTP account (Gmail App
# Password works great here: https://myaccount.google.com/apppasswords).
# If they're left blank, the app falls back to the fixed MOCK_OTP above and
# shows it directly in the UI - this is what keeps the seeded demo accounts
# (alice/bob/carol/dave, which aren't real inboxes) working out of the box.
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM_NAME = os.getenv("SMTP_FROM_NAME", "Signal Clone")
EMAIL_OTP_ENABLED = bool(SMTP_USER and SMTP_PASSWORD)

# Phone numbers are a fully supported login identifier, but there's no SMS
# provider wired up - they always use MOCK_OTP, same as usernames. (There
# used to be a Twilio integration here; it was removed to keep setup simple
# and avoid the "can only text pre-verified numbers" trial limitation.)

# --- File attachments ---
UPLOAD_DIR = os.getenv("UPLOAD_DIR", "./uploads")
MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "15"))
