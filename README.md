# Botsab

**Multi-tenant WhatsApp API platform.** Connect multiple WhatsApp accounts, send messages, manage groups, run bulk campaigns, and drive everything from AI agents via MCP — all through a single self-hosted deployment.

---

## Features

### WhatsApp Instances
- Connect unlimited WhatsApp accounts via QR scan
- Per-instance proxy support (HTTP/SOCKS5) for geo-distribution or ban avoidance
- Auto-reconnect with human-like presence simulation (online/offline cycling)
- Real-time QR code delivery via SSE stream

### Messaging
- Send **text, image, document, audio, and video** messages to any JID or phone number
- Bulk send with configurable per-message delays
- Mark messages as read
- Opt-out detection — automatic STOP / unsubscribe handling

### Groups
- List all groups the account is a member of
- Fetch full group metadata
- Send messages to groups
- Create groups and add/remove/promote/demote participants

### Bulk Campaigns
- Target a **Contact List** (phone numbers) or **Group List** (group JIDs)
- Configurable delays, batch sizes, batch pauses, daily limits, and send-hour windows
- Invisible Unicode suffix or hex suffix per message to evade duplicate detection
- Typing indicator simulation before send
- Campaign queue with position tracking, live progress, and per-recipient result log
- Cancel running campaigns without restarting the server

### Contact Lists & Group Lists
- Named lists with optional per-member labels
- Deduplication on insert
- Reuse across multiple campaigns

### Webhooks
- Subscribe per-instance to any combination of 8 event types:  
  `qr` · `connection.open` · `connection.close` · `message.received` · `message.sent` · `message.receipt` · `group.update` · `contact.update`
- Optional HMAC-SHA256 request signing
- Automatic retry with exponential backoff

### API Keys
- Multiple named keys per account
- SHA-256 hashed at rest, never stored raw
- Last-used timestamp tracking
- Instant revocation

### AI Agent Integration (MCP)
- **Model Context Protocol server** at `/mcp` with 22 tools covering all capabilities above
- **OAuth 2.0** authorization server — Claude.ai connects with a single URL, no manual credentials
  - `/.well-known/oauth-authorization-server` discovery
  - Dynamic client registration (RFC 7591)
  - Authorization Code + PKCE flow
  - Access token refresh
- Also accepts `x-api-key` for direct clients (Cursor, scripts, n8n)

### Admin
- Superadmin dashboard: view all users, adjust instance limits, approve pending registrations
- SaaS plan tiers (Starter / Pro / Business) with configurable instance limits

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 22, TypeScript |
| Framework | Express 4 |
| WhatsApp | [@whiskeysockets/baileys](https://github.com/WhiskeySockets/Baileys) v7 |
| Database | PostgreSQL 16 + Knex (migrations included) |
| Frontend | React 18, Vite, Tailwind CSS, shadcn/ui |
| AI Protocol | [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk) |
| Auth | bcrypt + SHA-256 API keys + OAuth 2.0 (PKCE) |
| Deployment | Docker Compose + nginx reverse proxy |

---

## Quick Start

### Prerequisites
- Docker + Docker Compose
- A domain with SSL (needed for WhatsApp and for Claude.ai OAuth redirect)

### 1. Clone & configure

```bash
git clone https://github.com/yourorg/botsab.git
cd botsab
cp .env.example .env
```

Edit `.env`:

```env
POSTGRES_PASSWORD=change_me
JWT_SECRET=change_me_32chars
SUPERADMIN_EMAIL=you@example.com
APP_URL=https://yourdomain.com
```

### 2. Start

```bash
docker compose up -d
```

The frontend is served on port `80` (configure `HTTP_PORT` in `.env` to change).  
The API runs internally on port `3000` behind nginx.

### 3. Register

Open `https://yourdomain.com/register`, create an account, then approve it in the admin panel (or set `SUPERADMIN_EMAIL` to auto-activate yourself).

---

## Connecting an Instance

1. Go to **Instances → New Instance**
2. Click **Connect** and scan the QR code with WhatsApp on your phone
3. The instance turns green — you're live

---

## API

All endpoints require an `x-api-key` header (or `Authorization: Bearer <key>`).

```bash
# Send a message
curl -X POST https://yourdomain.com/instances/{instanceId}/messages/send \
  -H "x-api-key: wapi_..." \
  -H "Content-Type: application/json" \
  -d '{"type":"text","to":"919876543210@s.whatsapp.net","text":"Hello!"}'
```

The **API Docs** page in the dashboard has a live curl builder — select your key, instance, and group, and it generates the exact command.

---

## Claude.ai Integration (MCP)

1. In Claude.ai → **Settings → Integrations → Add integration**
2. Enter: `https://yourdomain.com/mcp`
3. Claude auto-discovers OAuth, registers itself, and redirects you to the Botsab login page
4. Sign in with your Botsab credentials
5. All 22 WhatsApp tools are now available in Claude

**Available MCP tools:**

| Category | Tools |
|---|---|
| Instances | `list_instances` `get_instance_status` `connect_instance` `disconnect_instance` `get_qr_code` |
| Messages | `send_message` `send_bulk_messages` |
| Groups | `list_groups` `get_group` `send_group_message` `create_group` `manage_group_participants` |
| Campaigns | `list_campaigns` `get_campaign` `create_campaign` `cancel_campaign` |
| Contact Lists | `list_contact_lists` `get_contact_list` `create_contact_list` `add_contacts` |
| Group Lists | `list_group_lists` `get_group_list` `create_group_list` `add_group_jids` |
| Utilities | `search_contacts` `get_webhook` `set_webhook` |

For non-Claude clients (Cursor, scripts):

```json
{
  "mcpServers": {
    "botsab": {
      "url": "https://yourdomain.com/mcp",
      "headers": { "x-api-key": "wapi_..." }
    }
  }
}
```

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `POSTGRES_PASSWORD` | ✅ | — | PostgreSQL password |
| `JWT_SECRET` | ✅ | — | Secret for JWT signing |
| `SUPERADMIN_EMAIL` | ✅ | — | Email that gets superadmin on first register |
| `APP_URL` | ✅ | — | Public URL of the app (used in emails) |
| `HTTP_PORT` | | `80` | Host port nginx listens on |
| `BCRYPT_ROUNDS` | | `12` | bcrypt work factor |
| `SESSIONS_DIR` | | `./sessions` | Where Baileys auth state is stored |
| `UPLOADS_DIR` | | `./uploads` | Where uploaded media is stored |
| `RATE_LIMIT_MAX_REQUESTS` | | `100` | Max requests per window per key |
| `RATE_LIMIT_WINDOW_MS` | | `60000` | Rate limit window in ms |
| `WEBHOOK_TIMEOUT_MS` | | `10000` | Per-webhook request timeout |
| `WEBHOOK_MAX_RETRIES` | | `3` | Webhook retry attempts |
| `SMTP_HOST` | | `smtp.gmail.com` | SMTP server for registration emails |
| `SMTP_PORT` | | `465` | SMTP port |
| `SMTP_USER` | | — | SMTP username |
| `SMTP_PASS` | | — | SMTP password |
| `SMTP_FROM` | | — | From address for emails |

---

## Deployment

The included `deploy.sh` pushes the current branch to the production server and rebuilds Docker images in place — zero-downtime for sessions (the backend container restarts but Baileys auth state is persisted in a Docker volume):

```bash
./deploy.sh
```

Database migrations run automatically on server startup (`db.migrate.latest()`).

---

## Architecture

```
Browser / Claude.ai
        │
   [ nginx ]  ← serves SPA + proxies API
        │
  [ Express ]  ←  /auth  /instances  /mcp  /oauth  ...
        │
  ┌─────┴──────┐
  │ PostgreSQL │   Knex ORM, auto-migrations
  └─────┬──────┘
        │
  [ Baileys ]   one WASocket per instance, persisted to /sessions volume
```

Sessions survive backend restarts — on startup, any instance that was `connected` or `qr_pending` has its session automatically restored.

---

## License

MIT
