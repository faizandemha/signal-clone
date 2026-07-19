from datetime import datetime, timezone
from typing import Annotated, List, Optional

from pydantic import BaseModel, PlainSerializer, field_validator


def _as_utc_iso(dt: datetime) -> str:
    """Serialize a datetime as an ISO string with an explicit UTC offset.

    All timestamps in this app are stored as naive UTC (datetime.utcnow()).
    Serializing them as-is produces a string with no timezone marker (e.g.
    "2026-07-19T00:24:42"), and JS's `new Date(...)` treats a timezone-less
    ISO string as LOCAL time, not UTC - so every "last seen"/timestamp in the
    UI would silently be off by the viewer's UTC offset (5.5h for IST, etc).
    Attaching tzinfo before formatting fixes that at the API boundary,
    without touching how anything is stored in the database.
    """
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


UTCDateTime = Annotated[datetime, PlainSerializer(_as_utc_iso, return_type=str, when_used="json")]


# ---------- Auth ----------

class RegisterRequest(BaseModel):
    identifier: str  # phone number or username

    @field_validator("identifier")
    @classmethod
    def not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("identifier is required")
        return v


class RequestOtpResponse(BaseModel):
    message: str
    otp_hint: Optional[str] = None  # only present when the OTP is mocked, not really emailed


class VerifyOtpRequest(BaseModel):
    identifier: str
    otp: str


USERNAME_RE = r"^[a-z0-9_]{3,20}$"


class CompleteProfileRequest(BaseModel):
    display_name: str
    username: str
    avatar_color: Optional[str] = None
    about: Optional[str] = None

    @field_validator("username")
    @classmethod
    def valid_username(cls, v: str) -> str:
        import re

        v = v.strip().lower()
        if not re.match(USERNAME_RE, v):
            raise ValueError("Username must be 3-20 characters: lowercase letters, numbers, and underscores only")
        return v


class PublicUserOut(BaseModel):
    """What other people see about a user - their @username, not their
    login credential (email/phone). Used everywhere a user shows up in
    someone else's UI: contacts, group members, search results."""

    id: str
    username: Optional[str]
    display_name: str
    avatar_color: str
    about: str
    is_online: bool
    last_seen: UTCDateTime

    class Config:
        from_attributes = True


class UserOut(PublicUserOut):
    """Your own account, including the private login identifier - only
    ever returned for the currently-authenticated user (me/register/verify/
    profile), never when looking up someone else."""

    identifier: str


class AuthResponse(BaseModel):
    token: str
    user: UserOut
    is_new_user: bool


class SessionOut(BaseModel):
    """A logged-in device/browser - the "linked devices" view."""

    id: str
    device_label: str
    created_at: UTCDateTime
    last_active_at: UTCDateTime
    is_current: bool = False


# ---------- Contacts ----------

class AddContactRequest(BaseModel):
    identifier: str  # a username (with or without leading @) or a phone number - never an email
    nickname: Optional[str] = None


class ContactOut(BaseModel):
    id: str
    nickname: Optional[str]
    user: PublicUserOut
    is_blocked: bool = False

    class Config:
        from_attributes = True


# ---------- Conversations ----------

class CreateDirectConversationRequest(BaseModel):
    contact_user_id: str


class CreateGroupRequest(BaseModel):
    name: str
    member_ids: List[str]


class AddMemberRequest(BaseModel):
    user_id: str


class MemberOut(BaseModel):
    user: PublicUserOut
    is_admin: bool
    joined_at: UTCDateTime

    class Config:
        from_attributes = True


class UpdateAppearanceRequest(BaseModel):
    chat_color: Optional[str] = None  # hex color for your outgoing bubbles in this chat
    wallpaper: Optional[str] = None  # hex color (or preset key) for this chat's background


class ReplyPreview(BaseModel):
    id: str
    content: str
    sender_display_name: str


class AttachmentOut(BaseModel):
    url: str
    name: str
    content_type: str
    size: int


class MessageOut(BaseModel):
    id: str
    conversation_id: str
    sender_id: str
    sender_display_name: str
    sender_avatar_color: str
    content: str
    status: str
    created_at: UTCDateTime
    reply_to: Optional[ReplyPreview] = None
    attachment: Optional[AttachmentOut] = None
    is_edited: bool = False
    is_deleted: bool = False

    class Config:
        from_attributes = True


class EditMessageRequest(BaseModel):
    content: str


class ConversationOut(BaseModel):
    id: str
    type: str
    name: Optional[str]
    avatar_color: str
    members: List[MemberOut]
    last_message: Optional[MessageOut] = None
    unread_count: int = 0
    last_message_at: UTCDateTime
    # Your personal appearance preferences for this chat (never shared with
    # other members) and whether you've blocked the other side (direct only).
    chat_color: Optional[str] = None
    wallpaper: Optional[str] = None
    is_blocked: bool = False

    class Config:
        from_attributes = True


class SendMessageRequest(BaseModel):
    content: str = ""
    reply_to_id: Optional[str] = None
    attachment_url: Optional[str] = None
    attachment_name: Optional[str] = None
    attachment_type: Optional[str] = None
    attachment_size: Optional[int] = None


class MarkReadRequest(BaseModel):
    message_id: str
