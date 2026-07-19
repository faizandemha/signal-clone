# Signal Clone — Secure Messaging Platform

A functional clone of Signal built for the Scaler SDE Fullstack assignment: real email-based OTP login (plus mocked-but-fully-functional phone/username login), contacts, 1:1 and group messaging in real time, delivery/read receipts, typing indicators, image/file attachments, and a UI modeled closely on Signal Desktop.

End-to-end **encryption** is mocked, as explicitly permitted by the assignment — there is no real crypto. OTP delivery, however, is genuinely real when you register with an email address and SMTP is configured (see below), not just a fixed demo code. Phone-number and username sign-in work the same way end to end, just always with the mocked code shown on screen — no SMS provider is wired up (see "Known limitations" for why).

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 14 (App Router, TypeScript), Tailwind CSS, lucide-react icons |
| Backend | FastAPI (Python), SQLAlchemy ORM |
| Database | SQLite (file-based, schema below) |
| Real-time | Native WebSockets (one `/ws` endpoint, FastAPI's built-in support — no external broker) |
| Auth | Real email OTP via SMTP (falls back to a fixed mocked code when unconfigured, or for phone/username identifiers) + bearer session tokens |
| File storage | Local disk (`backend/uploads/`), served back over HTTP |

## Project structure

```
signal-clone/
  backend/           FastAPI app
    app/
      models.py       SQLAlchemy models (schema lives here)
      schemas.py       Pydantic request/response models
      routers/         auth, contacts, conversations (+messages), uploads, websocket
      email_service.py   real OTP delivery over SMTP
      websocket_manager.py   in-memory connection registry + broadcast helpers
      seed.py          demo data seeder
      reset_db.py      wipes all data before going live with real users
    uploads/           attachment storage (created at runtime, gitignored)
    requirements.txt
    Procfile           for Render/Railway
  frontend/          Next.js app
    app/               routes: /login, /chat
    components/        Sidebar, ChatHeader, MessageBubble, modals, settings, etc.
    lib/               API client, auth context, websocket context, types
  README.md          (this file)
```

## Architecture overview

- **Auth**: `POST /api/auth/register` issues an OTP. If the identifier is a well-formed email address *and* SMTP credentials are configured, a real, randomly generated 6-digit code is emailed out via `app/email_service.py` (`smtplib` + STARTTLS), and the API response does **not** reveal the code. Otherwise (phone numbers, usernames, or SMTP not configured) it falls back to a fixed mocked code returned directly in the response — this is what keeps the seeded demo accounts (`alice`/`bob`/... and the phone-number account `+12125550123`) working without needing real inboxes or an SMS provider. Phone-number login is a fully real, first-class identifier in the schema and UI; it just always uses the mocked code rather than a real text, by design (no SMS provider is wired up — see "Known limitations" for why). `POST /api/auth/verify` checks the code against the `otp_requests` table (marking it consumed so it can't be replayed), creates the user on first login, and issues a bearer session token stored in a `sessions` table. The frontend persists the token in `localStorage` and sends it as `Authorization: Bearer <token>` on REST calls and as a `?token=` query param on the WebSocket connection.
- **Usernames vs. login identifier**: `identifier` (the email/phone/username you log in with) and `username` (the public `@handle` other people find you by) are deliberately separate columns. A brand-new user picks their `username` during the profile-setup step (`POST /api/auth/profile`, validated for format + uniqueness). Every response that shows a user *to someone else* — contacts, group members, search results — is serialized through `PublicUserOut`, which excludes `identifier` entirely; only `/me`, `/register`, `/verify`, and `/profile` (i.e. your own account) ever return it. Adding a contact or searching (`POST /api/contacts`, `GET /api/users/search`) matches on `username` or a phone-shaped `identifier` only — never on email, so an email-registered account's login address is never discoverable by anyone else.
- **Real-time**: a single `/ws?token=...` WebSocket endpoint per connected client. An in-memory `ConnectionManager` (`websocket_manager.py`) tracks live sockets per user and broadcasts JSON events (`message`, `typing`, `message_status`, `presence`) to every relevant conversation member. Sending a message goes through a REST call (`POST /api/conversations/{id}/messages`) for reliability, and the backend both persists it and pushes it out over WebSocket to all participants — including back to the sender's other tabs — so the UI stays live everywhere without polling. Typing indicators are pure WebSocket events (never persisted).
- **Delivery/read receipts (1:1 only, per the spec)**: if the recipient has a live socket when a message is sent, it's marked `delivered` immediately and a `message_status` event pings the sender's tick from single to double check. Opening a conversation calls `POST /.../read`, which flips all unread messages to `read` and notifies the sender's socket so their ticks turn blue.
- **Groups**: membership lives in `conversation_members` with a per-row `is_admin` flag. Only admins can add/remove members (removing yourself is always allowed).
- **Attachments**: `POST /api/uploads` (multipart) saves the file to `backend/uploads/` under a generated filename and hands back a URL + metadata; that gets attached to a message via `POST /api/conversations/{id}/messages` (a message can carry text, an attachment, or both). Images render as inline thumbnails in the chat; other files render as a downloadable file card, matching Signal's behavior.
- **Frontend state**: two React contexts — `AuthProvider` (session) and `SocketProvider` (WebSocket connection + pub/sub) — wrap the app. `app/chat/page.tsx` owns conversation/message state and reconciles incoming socket events against it (dedup by message id, reorder conversation list by latest activity, track per-conversation typing sets with a 4s auto-expiry in case a "stopped typing" event is dropped).
- **Blocking**: `blocks` is a one-directional table (`blocker_id -> blocked_user_id`), mirroring the `contacts` pattern. Blocking someone doesn't delete the conversation or contact — it just hides you from their search results going forward and rejects new messages either direction with a 403 (`create_and_broadcast_message` checks both directions before persisting). A conversation's `is_blocked` field only ever reflects blocks *you* placed; if the other person blocked you, your send simply 403s and the frontend surfaces that error as a toast, since the API deliberately never reveals "you've been blocked by someone" as a queryable fact (real Signal does the same — no read-receipt-style confirmation of a block).
- **Per-chat appearance**: `chat_color` and `wallpaper` live on `conversation_members`, not `conversations` — each participant picks their own look for a shared chat, same as real Signal. Set via `PATCH /api/conversations/{id}/appearance`, surfaced through an `AppearancePicker` opened from Contact info (1:1) or Group info.
- **Linked devices**: rather than mocking real multi-device key sync (out of scope for an assignment-sized project), "linked devices" is implemented as a genuine active-session list. Every login creates a `sessions` row tagged with a `device_label` parsed from the browser's `User-Agent` (e.g. "Chrome on macOS") and a `last_active_at` timestamp that's bumped on every authenticated request. Settings → Linked devices lists all of your live sessions and lets you remotely revoke any of them (`DELETE /api/auth/sessions/{id}`), which deletes that session's token immediately — the next request from that device gets a 401. Logging out only ever kills the current device's session.
- **Notifications**: enabling notifications in Settings requests the browser's Notification permission once and persists the on/off + sound preference in `localStorage`. When a `message` WebSocket event arrives for a conversation that isn't both open *and* the active browser tab, the frontend fires a `Notification` (clicking it focuses the tab and opens that conversation) and, if sound is enabled, plays a short tone synthesized with the Web Audio API — no shipped audio asset needed.
- **Editing and deleting messages**: sender-only, enforced server-side (`PATCH`/`DELETE /api/conversations/{id}/messages/{message_id}`, 403 if you're not the sender). Deleting is a soft delete - `messages.is_deleted` flips on and the content/attachment columns are cleared, but the row stays so message ordering, `reply_to` references, and read receipts don't break; any reply quoting a deleted message renders "This message was deleted" instead of the old text (evaluated at read time via `serialize_message`, so it updates everywhere retroactively, not just at the moment of deletion). Editing sets `is_edited`/`edited_at` and the UI shows a small "edited" label. Both actions broadcast a `message_edited`/`message_deleted` WebSocket event carrying the full updated message so every open tab/device (including group members) stays in sync instantly, the same way a new `message` event does.
- **Timestamps are always UTC on the wire**: every datetime column is stored as naive UTC (`datetime.utcnow()`), but a shared `UTCDateTime` Pydantic type (`schemas.py`) attaches an explicit `+00:00` offset before any response is serialized. This matters because a timezone-less ISO string (e.g. `"2026-07-19T00:24:42"`) gets misinterpreted by the browser's `new Date(...)` as *local* time, not UTC - silently shifting every "last seen"/timestamp in the UI by the viewer's own UTC offset. Attaching the offset at the API boundary fixes that everywhere at once, without touching how anything is stored in the database.

## Database schema

```
users
  id (pk), identifier (unique — email/phone/username you log IN with, private),
  username (unique, nullable — public @handle other people find you BY),
  display_name, avatar_color, about, is_online, last_seen, created_at

sessions
  id (pk), token (unique bearer token), user_id (fk -> users), created_at,
  device_label (parsed from User-Agent, e.g. "Chrome on macOS"), last_active_at

otp_requests
  id (pk), identifier, otp, created_at, consumed   -- mocked OTP log

contacts
  id (pk), owner_id (fk -> users), contact_user_id (fk -> users), nickname, created_at
  unique(owner_id, contact_user_id)                -- one-directional address book entry

blocks
  id (pk), blocker_id (fk -> users), blocked_user_id (fk -> users), created_at
  unique(blocker_id, blocked_user_id)              -- one-directional, like contacts

conversations
  id (pk), type (direct | group), name (group only), avatar_color,
  created_by (fk -> users), created_at, last_message_at   -- drives conversation-list sort

conversation_members
  id (pk), conversation_id (fk), user_id (fk), is_admin,
  joined_at, last_read_message_id, last_read_at,   -- per-user read cursor -> unread counts
  chat_color, wallpaper (nullable — per-user, per-chat appearance)
  unique(conversation_id, user_id)

messages
  id (pk), conversation_id (fk), sender_id (fk), content, reply_to_id (fk -> messages, nullable),
  status (sent | delivered | read), created_at,
  attachment_url, attachment_name, attachment_type, attachment_size (all nullable),
  is_edited, edited_at (nullable), is_deleted        -- soft delete: content/attachment cleared, row kept

message_receipts
  id (pk), message_id (fk), user_id (fk), delivered_at, read_at
  unique(message_id, user_id)                      -- per-recipient ticks for 1:1 chats
```

**Relationships**: a `User` has many `Session`s and `Contact`s. A `Conversation` has many `ConversationMember`s (join table to `User`) and many `Message`s. A `Message` belongs to one `Conversation` and one sender `User`, optionally replies to another `Message`, and has zero or more `MessageReceipt`s (one per recipient, direct chats only).

**Design notes / assumptions**:
- Contacts are one-directional rows (`owner_id -> contact_user_id`) rather than a symmetric friendship, matching how a real phone address book works — you can add someone without them adding you back, and either side can already message the other once a direct conversation exists.
- `conversation_members.last_read_at` is the read cursor used to compute `unread_count` per conversation per user, rather than storing a boolean-per-message-per-user (cheaper to query, standard chat-app pattern).
- Group messages don't get per-member read ticks (the assignment only requires delivery/read receipts for 1:1 — see "Signal Experience" section of the brief); group messages always show as sent bubbles without ticks.
- Avatars are generated from the user's initials + a chosen accent color rather than uploaded images, matching Signal's own fallback avatar behavior for contacts without a profile photo (attachments, on the other hand, are real uploads — see below).
- `username` is nullable at the DB level only to cover the brief moment between OTP verification and profile completion for a brand-new user; the API always requires it going forward and no endpoint returns a user to someone else without one.
- A message can hold text, an attachment, or both — `attachment_*` columns are simply left `NULL` for plain text messages, avoiding a join for the common case.
- SQLite is used directly (`sqlite:///./signal_clone.db`), as specified. For a horizontally-scaled deployment you'd swap `DATABASE_URL` for Postgres — the SQLAlchemy models don't need to change.

## API overview

All endpoints are prefixed `/api` and (except auth) require `Authorization: Bearer <token>`.

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/register` | Request an OTP — real email if SMTP is configured, mocked otherwise (always mocked for phone/username) |
| POST | `/api/auth/verify` | Verify OTP, create user if new, return session token |
| POST | `/api/auth/profile` | Set display name, a unique `@username`, and avatar color (first-run profile setup) |
| GET | `/api/auth/me` | Current user (includes your private `identifier`) |
| POST | `/api/auth/logout` | Invalidate session |
| GET | `/api/contacts` | List your contacts (returns their `@username`, never their email/phone) |
| POST | `/api/contacts` | Add a contact by `@username` or phone number (email is never a valid lookup) |
| GET | `/api/users/search?q=` | Search users by `@username` or phone number only |
| GET | `/api/conversations` | List your conversations, sorted by latest activity, with unread counts |
| POST | `/api/conversations/direct` | Get-or-create a 1:1 conversation with a contact |
| POST | `/api/conversations/group` | Create a group (name + member ids) |
| GET | `/api/conversations/{id}` | Conversation detail incl. members |
| GET | `/api/conversations/{id}/messages` | Paginated message history (`?before=&limit=`) |
| POST | `/api/conversations/{id}/messages` | Send a message — text, an attachment, or both (persists + broadcasts over WS) |
| PATCH | `/api/conversations/{id}/messages/{message_id}` | Edit your own message's text (sender-only, broadcasts `message_edited`) |
| DELETE | `/api/conversations/{id}/messages/{message_id}` | Soft-delete your own message (sender-only, broadcasts `message_deleted`) |
| POST | `/api/conversations/{id}/read` | Mark conversation read, notify sender(s) |
| POST | `/api/uploads` | Upload an image/file (multipart), returns a URL to attach to a message |
| POST | `/api/conversations/{id}/members` | Add a member (group admin only) |
| DELETE | `/api/conversations/{id}/members/{user_id}` | Remove a member (admin, or yourself) |
| PATCH | `/api/conversations/{id}/appearance` | Set your own `chat_color`/`wallpaper` for this conversation |
| GET | `/api/contacts/blocked` | List contacts you've blocked |
| POST | `/api/contacts/{user_id}/block` | Block a user (rejects future messages either direction) |
| DELETE | `/api/contacts/{user_id}/block` | Unblock a user |
| GET | `/api/auth/sessions` | List your active sessions ("linked devices") |
| DELETE | `/api/auth/sessions/{id}` | Revoke a session — signs that device out immediately |
| WS | `/ws?token=` | Real-time channel: `message`, `message_edited`, `message_deleted`, `typing`, `message_status`, `presence` events |

Interactive docs are also available at `/docs` (FastAPI's built-in Swagger UI) once the backend is running.

## Setup instructions (local)

### Backend

```bash
cd backend
python3 -m venv venv && source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env

python -m app.seed          # seeds demo users/conversations/messages
uvicorn app.main:app --reload --port 8000
```

Backend runs at `http://localhost:8000` (docs at `/docs`, health check at `/api/health`).

#### Enabling real email OTP delivery

By default `backend/.env` has `SMTP_USER`/`SMTP_PASSWORD` blank, so every OTP is mocked and shown directly in the UI. To send real codes:

1. Turn on 2-Step Verification on a Google account (Google Account → Security).
2. Generate an App Password: [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords) → app "Mail" → copy the 16-character password.
3. In `backend/.env`, set:
   ```
   SMTP_USER=youraddress@gmail.com
   SMTP_PASSWORD=<the 16-character app password>
   ```
4. Restart the backend. Registering with any real email address (not `alice`/`bob`/etc.) now sends an actual code to that inbox instead of showing it on screen.

Any SMTP provider works the same way (just change `SMTP_HOST`/`SMTP_PORT`) — Gmail is the path of least resistance since it's free and needs no separate signup.

### Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local   # points at http://localhost:8000 by default
npm run dev
```

Frontend runs at `http://localhost:3000` and redirects to `/login`.

### Demo accounts

The seed script creates five users, already fully onboarded with a username. These are username/phone-style login identifiers, not real inboxes, so they always use the mocked OTP (default **123456**, configurable via `MOCK_OTP` in `backend/.env`) — phone-number login always works this way (there's no SMS provider configured), and username login is mocked by definition:

| Login identifier | Username | Name |
|---|---|---|
| `alice` | `@alice` | Alice Carter — most fully populated inbox (4 direct chats + 2 groups) |
| `bob` | `@bob` | Bob Nguyen |
| `carol` | `@carol_d` | Carol Diaz |
| `dave` | `@dave_kim` | Dave Kim |
| `+12125550123` | `@erin` | Erin Walsh |

Log in as `alice` for the best first look. Open a second browser (or incognito window) as `bob` to see real-time delivery, typing indicators, read receipts, and attachments live between two sessions. Try adding `@carol_d` or `+12125550123` as a contact from the "New chat" search to see username/phone-based discovery in action.

Erin's number (`+12125550123`) deliberately follows the classic NXX-555-XXXX "movie phone number" pattern reserved for fiction — a nod to why it's a safe placeholder, even though this app doesn't attempt real SMS sending at all.

A brand-new real user (registering with their own email) starts completely empty — zero conversations, zero contacts, and can't find or be found by the demo accounts until they specifically search for one by username/phone. See "Going live with real users" below for wiping the demo data entirely before sharing a deployed link.

### Going live with real users

Before sharing your deployed link with actual people, wipe the seeded demo accounts so they don't clutter search results for real users:

```bash
cd backend
python -m app.reset_db --yes
```

This deletes every user/conversation/message but leaves the schema intact — the app comes back up as a genuinely blank slate. (Skip `--yes` to get an interactive confirmation prompt instead.) Run this once against your deployed database (e.g. via Render's shell) right before you actually send someone the link.

## Deployment guide

### 1. Push to GitHub

```bash
cd signal-clone
git init
git add .
git commit -m "Signal clone: FastAPI + Next.js messaging app"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```
Make sure the repository is set to **public** on GitHub before submitting.

### 2. Deploy the backend (Render)

1. On [render.com](https://render.com), **New +** → **Web Service** → connect your GitHub repo.
2. Root directory: `backend`
3. Build command: `pip install -r requirements.txt`
4. Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
5. Add environment variables: `CORS_ORIGINS=https://<your-vercel-app>.vercel.app`, `MOCK_OTP=123456`, and optionally `SMTP_USER`/`SMTP_PASSWORD` (see the section above) if you want real email OTP codes on the deployed app too.
6. After the first deploy, open a shell (or add a one-off job) and run `python -m app.seed` to seed demo data on the deployed SQLite file — or `python -m app.reset_db --yes` instead if you want the live app to start empty for real users from day one.
7. Note the deployed URL, e.g. `https://signal-clone-api.onrender.com`.

*(Railway works the same way — root directory `backend`, same start command, same env vars.)*

*(Deploying to Heroku instead? Heroku needs a `Procfile` in `backend/` to know the start command, since it has no dashboard field for it like Render/Railway do. It's not included in this repo — extensionless files like `Procfile` sometimes get flagged by Windows Defender/SmartScreen as a false positive on downloaded zips, so it's left out to avoid that. Just create `backend/Procfile` yourself with one line: `web: uvicorn app.main:app --host 0.0.0.0 --port $PORT`.)*

### 3. Deploy the frontend (Vercel)

1. On [vercel.com](https://vercel.com), **Add New** → **Project** → import the same GitHub repo.
2. Root directory: `frontend`
3. Framework preset: Next.js (auto-detected).
4. Environment variables:
   - `NEXT_PUBLIC_API_URL=https://signal-clone-api.onrender.com`
   - `NEXT_PUBLIC_WS_URL=wss://signal-clone-api.onrender.com` (note `wss://`, not `ws://`, once the backend is on HTTPS)
5. Deploy. Vercel gives you a URL like `https://signal-clone.vercel.app`.
6. Go back to Render and update `CORS_ORIGINS` to that exact Vercel URL, then redeploy the backend so the browser is allowed to call it.

### 4. Submit

Submit both links: the public GitHub repo, and the Vercel URL from step 3.

## Known limitations / what's mocked

- End-to-end encryption is mocked, as explicitly permitted by the assignment — there's no real crypto anywhere in the message pipeline.
- OTP is genuinely emailed when you register with an email address and SMTP is configured; it's mocked (fixed code, shown in the UI) for phone numbers, usernames, unconfigured SMTP, and the seeded demo accounts.
- Phone-number login has no real SMS delivery behind it on purpose. An earlier version wired up Twilio, but its free-trial tier can only text numbers you've manually pre-verified in the Twilio console — workable for a demo with a couple of known testers, not for open signup from arbitrary numbers, which is what a real submission needs. Rather than ship a feature that silently fails for anyone not on an allowlist, phone login was kept as a fully real identifier (schema, search, contacts, everything) but always uses the same mocked-code flow as usernames. Wiring up a paid SMS provider later needs zero frontend changes - just fill in provider credentials in `backend/.env` and add an `elif` branch to `app/routers/auth.py`'s `request_otp` (mirroring the `is_email(...)` branch already there for SMTP), using a phone-format check like `contacts.py`'s `looks_like_phone`.
- Voice/video calls and Stories are still placeholders (buttons show a "coming soon" toast) — out of scope for a text/attachment messaging assignment.
- "Linked devices" is a real active-session list with remote logout (see Architecture overview above), not full multi-device end-to-end-encrypted key sync — actual Signal-style multi-device is a much larger scope (per-device key bundles, sealed sender, etc.) than this assignment calls for.
- Attachments are stored on local disk (`backend/uploads/`). Free SQLite/disk-on-Render deployments don't persist storage across redeploys — fine for a demo/evaluation, but re-run the seed script (and re-upload any test attachments) after a redeploy if storage resets. For a production deployment you'd point this at S3/Cloudinary/etc. instead — the upload endpoint is the only place that would need to change.
- Bonus items implemented: real email OTP, chosen `@usernames` with privacy-safe discovery (search/add by username or phone, never by email), image/file attachments, reply-to quoting (double-click any message), editing and deleting your own sent messages (hover a bubble → the "⋮" menu), dark mode (Settings → Appearance), a responsive layout (sidebar/thread collapse into a single pane on mobile), browser push notifications with sound (Settings → Notifications), per-chat color & wallpaper customization (Contact/Group info), blocking with enforcement on both sides (Settings → Blocked contacts, or Contact info), and a real linked-devices/session-management view with remote logout (Settings → Linked devices). Emoji reactions and disappearing messages were left out of scope to keep the core experience solid within the assignment's time budget.
- Username changes aren't supported after initial setup (no "edit username" flow yet) — you'd add a `PATCH /api/auth/profile` variant with the same uniqueness check to support that.
