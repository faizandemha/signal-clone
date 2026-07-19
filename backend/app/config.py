import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./signal_clone.db")
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",") if o.strip()]
MOCK_OTP = os.getenv("MOCK_OTP", "123456")

# Verification is mocked for every identifier type (email, phone, username)
# per the assignment spec - a fixed code (above) is generated and shown
# directly in the UI rather than actually delivered. This is what keeps the
# seeded demo accounts (alice/bob/carol/dave, +12125550123) working without
# any external provider setup, and matches "verification can be mocked with
# a fixed OTP" from the assignment brief exactly.

# --- File attachments ---
UPLOAD_DIR = os.getenv("UPLOAD_DIR", "./uploads")
MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "15"))
