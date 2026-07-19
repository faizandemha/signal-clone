"""
Database schema (SQLite via SQLAlchemy ORM).

users                   Registered accounts (phone/username based, mocked auth).
sessions                Active login sessions (bearer tokens) per user - also the "linked devices" list.
contacts                Address-book style relationship: owner_id -> contact_user_id.
blocks                  One-directional block relationship: blocker_id -> blocked_user_id.
conversations           A direct (1:1) or group thread.
conversation_members    Join table: user <-> conversation, with per-user read cursor, admin flag,
                        and personal chat color/wallpaper preferences.
messages                Persisted chat messages belonging to a conversation.
message_receipts        Per-recipient delivered/read tracking for 1:1 delivery ticks.
"""

import enum
import secrets
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.database import Base


def gen_id() -> str:
    return uuid.uuid4().hex


class ConversationType(str, enum.Enum):
    direct = "direct"
    group = "group"


class MessageStatus(str, enum.Enum):
    sent = "sent"
    delivered = "delivered"
    read = "read"


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=gen_id)
    # Login credential - an email, phone number, or (for the seeded demo
    # accounts) a bare username. Never shown to other users - see `username`
    # below for the public, searchable handle.
    identifier = Column(String, unique=True, nullable=False, index=True)
    # Public @handle other people search/add contacts by. Set once during
    # onboarding (see /api/auth/profile). Nullable only for the brief window
    # between OTP verification and profile completion.
    username = Column(String, unique=True, nullable=True, index=True)
    display_name = Column(String, nullable=False)
    avatar_color = Column(String, nullable=False, default="#3a76f0")
    about = Column(String, default="Available")
    is_online = Column(Boolean, default=False)
    last_seen = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)

    sessions = relationship("Session", back_populates="user", cascade="all, delete-orphan")


class Session(Base):
    """A logged-in session/token - doubles as a "linked device" entry.
    Each browser/device that logs in gets its own row here, so listing a
    user's sessions is exactly the "linked devices" view."""

    __tablename__ = "sessions"

    id = Column(String, primary_key=True, default=gen_id)
    token = Column(String, unique=True, nullable=False, default=lambda: secrets.token_hex(24), index=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    device_label = Column(String, nullable=False, default="Unknown device")
    created_at = Column(DateTime, default=datetime.utcnow)
    last_active_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="sessions")


class OtpRequest(Base):
    """Mocked OTP challenge issued at registration/login time."""

    __tablename__ = "otp_requests"

    id = Column(String, primary_key=True, default=gen_id)
    identifier = Column(String, nullable=False, index=True)
    otp = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    consumed = Column(Boolean, default=False)


class Contact(Base):
    __tablename__ = "contacts"
    __table_args__ = (UniqueConstraint("owner_id", "contact_user_id", name="uq_owner_contact"),)

    id = Column(String, primary_key=True, default=gen_id)
    owner_id = Column(String, ForeignKey("users.id"), nullable=False)
    contact_user_id = Column(String, ForeignKey("users.id"), nullable=False)
    nickname = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    owner = relationship("User", foreign_keys=[owner_id])
    contact_user = relationship("User", foreign_keys=[contact_user_id])


class Block(Base):
    """blocker_id has blocked blocked_user_id. One-directional, like Contact:
    blocking someone doesn't require them to have blocked you back."""

    __tablename__ = "blocks"
    __table_args__ = (UniqueConstraint("blocker_id", "blocked_user_id", name="uq_blocker_blocked"),)

    id = Column(String, primary_key=True, default=gen_id)
    blocker_id = Column(String, ForeignKey("users.id"), nullable=False)
    blocked_user_id = Column(String, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    blocker = relationship("User", foreign_keys=[blocker_id])
    blocked_user = relationship("User", foreign_keys=[blocked_user_id])


class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(String, primary_key=True, default=gen_id)
    type = Column(Enum(ConversationType), nullable=False, default=ConversationType.direct)
    name = Column(String, nullable=True)  # group name only
    avatar_color = Column(String, nullable=False, default="#3a76f0")
    created_by = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_message_at = Column(DateTime, default=datetime.utcnow, index=True)

    members = relationship("ConversationMember", back_populates="conversation", cascade="all, delete-orphan")
    messages = relationship("Message", back_populates="conversation", cascade="all, delete-orphan")


class ConversationMember(Base):
    __tablename__ = "conversation_members"
    __table_args__ = (UniqueConstraint("conversation_id", "user_id", name="uq_conversation_user"),)

    id = Column(String, primary_key=True, default=gen_id)
    conversation_id = Column(String, ForeignKey("conversations.id"), nullable=False)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    is_admin = Column(Boolean, default=False)
    joined_at = Column(DateTime, default=datetime.utcnow)
    last_read_message_id = Column(String, nullable=True)
    last_read_at = Column(DateTime, nullable=True)

    # Personal appearance preferences for THIS member's view of THIS
    # conversation only (Signal's "chat color" / wallpaper feature) - never
    # visible to other participants.
    chat_color = Column(String, nullable=True)
    wallpaper = Column(String, nullable=True)

    conversation = relationship("Conversation", back_populates="members")
    user = relationship("User")


class Message(Base):
    __tablename__ = "messages"

    id = Column(String, primary_key=True, default=gen_id)
    conversation_id = Column(String, ForeignKey("conversations.id"), nullable=False, index=True)
    sender_id = Column(String, ForeignKey("users.id"), nullable=False)
    content = Column(Text, nullable=False, default="")
    reply_to_id = Column(String, ForeignKey("messages.id"), nullable=True)
    status = Column(Enum(MessageStatus), nullable=False, default=MessageStatus.sent)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    # Optional single attachment (image or file). Kept as flat nullable
    # columns rather than a separate table since a message has at most one.
    attachment_url = Column(String, nullable=True)
    attachment_name = Column(String, nullable=True)
    attachment_type = Column(String, nullable=True)
    attachment_size = Column(Integer, nullable=True)

    # Edit/delete (sender-only, enforced in the router). Deleting is a soft
    # delete - content/attachment are cleared and is_deleted flips on, but
    # the row stays so message order, reply-to references, and receipts
    # stay intact; the UI renders a "This message was deleted" tombstone.
    is_edited = Column(Boolean, nullable=False, default=False)
    edited_at = Column(DateTime, nullable=True)
    is_deleted = Column(Boolean, nullable=False, default=False)

    conversation = relationship("Conversation", back_populates="messages")
    sender = relationship("User")
    reply_to = relationship("Message", remote_side=[id])


class MessageReceipt(Base):
    """Per-recipient delivered/read timestamps, used for 1:1 double-tick receipts."""

    __tablename__ = "message_receipts"
    __table_args__ = (UniqueConstraint("message_id", "user_id", name="uq_message_user_receipt"),)

    id = Column(String, primary_key=True, default=gen_id)
    message_id = Column(String, ForeignKey("messages.id"), nullable=False)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    delivered_at = Column(DateTime, nullable=True)
    read_at = Column(DateTime, nullable=True)
