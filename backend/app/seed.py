"""Seed the database with demo users, contacts, conversations, and messages
so the app is immediately usable after `python -m app.seed`.

All demo accounts log in with the mocked OTP (see app/config.py, default 123456).
"""

from datetime import datetime, timedelta

from app.database import Base, SessionLocal, engine
from app import models

DEMO_OTP_NOTE = "Use the mocked OTP (default 123456) to log into any demo account below."

USERS = [
    dict(identifier="alice", username="alice", display_name="Alice Carter", avatar_color="#3a76f0", about="Living my best life"),
    dict(identifier="bob", username="bob", display_name="Bob Nguyen", avatar_color="#2e9e6d", about="Busy busy"),
    dict(identifier="carol", username="carol_d", display_name="Carol Diaz", avatar_color="#e0633f", about="Signal > everything"),
    dict(identifier="dave", username="dave_kim", display_name="Dave Kim", avatar_color="#9b59d0", about="At the gym"),
    # 212-555-0123: the classic "movie phone number" pattern (NXX-555-XXXX)
    # reserved for fiction - included to demonstrate phone-number login,
    # which always uses the mocked OTP (no SMS provider is configured).
    dict(identifier="+12125550123", username="erin", display_name="Erin Walsh", avatar_color="#e0b23f", about="Available"),
]


def run():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if db.query(models.User).count() > 0:
            print("Database already has data - skipping seed. Delete signal_clone.db to reseed.")
            return

        users = {}
        for u in USERS:
            user = models.User(**u)
            db.add(user)
            users[u["identifier"]] = user
        db.commit()
        for u in users.values():
            db.refresh(u)

        alice, bob, carol, dave, erin = (
            users["alice"], users["bob"], users["carol"], users["dave"], users["+12125550123"],
        )

        # Everyone has everyone else as a contact, for a populated address book.
        for owner in users.values():
            for other in users.values():
                if owner.id == other.id:
                    continue
                db.add(models.Contact(owner_id=owner.id, contact_user_id=other.id))
        db.commit()

        def direct_conversation(u1, u2):
            conv = models.Conversation(type=models.ConversationType.direct, created_by=u1.id)
            db.add(conv)
            db.commit()
            db.refresh(conv)
            db.add(models.ConversationMember(conversation_id=conv.id, user_id=u1.id, is_admin=True))
            db.add(models.ConversationMember(conversation_id=conv.id, user_id=u2.id, is_admin=True))
            db.commit()
            return conv

        def send(conv, sender, content, minutes_ago, status=models.MessageStatus.read):
            msg = models.Message(
                conversation_id=conv.id,
                sender_id=sender.id,
                content=content,
                status=status,
                created_at=datetime.utcnow() - timedelta(minutes=minutes_ago),
            )
            db.add(msg)
            conv.last_message_at = msg.created_at
            db.commit()
            return msg

        # --- Alice <-> Bob ---
        c1 = direct_conversation(alice, bob)
        send(c1, alice, "Hey Bob! Are we still on for the sync tomorrow?", 120)
        send(c1, bob, "Yep, 10am works for me.", 118)
        send(c1, alice, "Perfect, I'll send the invite.", 117)
        send(c1, bob, "Also - did you see the new Signal desktop update?", 40)
        send(c1, alice, "Not yet, checking it out now", 5, status=models.MessageStatus.delivered)

        # --- Alice <-> Carol ---
        c2 = direct_conversation(alice, carol)
        send(c2, carol, "Loved your photos from the trip!", 300)
        send(c2, alice, "Thank you! Bali was incredible.", 295)
        send(c2, carol, "We should plan a trip together next year", 20, status=models.MessageStatus.sent)

        # --- Alice <-> Dave ---
        c3 = direct_conversation(alice, dave)
        send(c3, dave, "Gym at 6?", 15, status=models.MessageStatus.delivered)

        # --- Alice <-> Erin ---
        c4 = direct_conversation(alice, erin)
        send(c4, erin, "Welcome to the neighborhood!", 1440)
        send(c4, alice, "Thanks so much, excited to be here", 1430)

        # --- Group: Product Team ---
        group = models.Conversation(type=models.ConversationType.group, name="Product Team", created_by=alice.id, avatar_color="#3a76f0")
        db.add(group)
        db.commit()
        db.refresh(group)
        for u, is_admin in [(alice, True), (bob, False), (carol, False), (dave, False)]:
            db.add(models.ConversationMember(conversation_id=group.id, user_id=u.id, is_admin=is_admin))
        db.commit()
        send(group, alice, "Welcome to the Product Team group!", 600)
        send(group, bob, "Excited to be here", 590)
        send(group, carol, "Let's ship something great", 580)
        send(group, dave, "What's on the roadmap this week?", 30, status=models.MessageStatus.sent)

        # --- Group: Weekend Trip ---
        group2 = models.Conversation(type=models.ConversationType.group, name="Weekend Trip 🏔️", created_by=carol.id, avatar_color="#e0633f")
        db.add(group2)
        db.commit()
        db.refresh(group2)
        for u, is_admin in [(carol, True), (alice, False), (erin, False)]:
            db.add(models.ConversationMember(conversation_id=group2.id, user_id=u.id, is_admin=is_admin))
        db.commit()
        send(group2, carol, "Who's in for the cabin this weekend?", 200)
        send(group2, erin, "Count me in!", 190)
        send(group2, alice, "Same, can't wait", 180)

        print("Seed complete.")
        print(DEMO_OTP_NOTE)
        print("Demo accounts (login identifier -> @username -> display name):")
        for u in USERS:
            print(f"  {u['identifier']:>15}  ->  @{u['username']:<10}  ->  {u['display_name']}")
        print("\nLog in as 'alice' to see the most fully populated inbox.")
        print("Before inviting real people to use this deployment, run `python -m app.reset_db`")
        print("to wipe these demo accounts and all their data (schema stays intact).")
    finally:
        db.close()


if __name__ == "__main__":
    run()
