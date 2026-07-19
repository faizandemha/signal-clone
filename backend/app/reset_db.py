"""Wipe every row from the database - users, sessions, contacts,
conversations, and messages - without touching the schema.

Use this to go from "seeded with demo data for local testing" to "empty,
ready for real people" before you actually share a deployed link. Run:

    python -m app.reset_db

This asks for confirmation unless you pass --yes (handy for a one-off CI/
deploy job, e.g. `python -m app.reset_db --yes`).
"""

import sys

from app.database import Base, SessionLocal, engine
from app import models


def run():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        # Delete in FK-safe order (children before parents).
        db.query(models.MessageReceipt).delete()
        db.query(models.Message).delete()
        db.query(models.ConversationMember).delete()
        db.query(models.Conversation).delete()
        db.query(models.Contact).delete()
        db.query(models.OtpRequest).delete()
        db.query(models.Session).delete()
        db.query(models.User).delete()
        db.commit()
        print("Database wiped - no users, contacts, conversations, or messages remain.")
        print("The app is now a blank slate, ready for real registrations.")
    finally:
        db.close()


if __name__ == "__main__":
    if "--yes" not in sys.argv:
        confirm = input("This permanently deletes ALL users/conversations/messages. Type 'wipe' to continue: ")
        if confirm.strip().lower() != "wipe":
            print("Cancelled - nothing was deleted.")
            sys.exit(0)
    run()
