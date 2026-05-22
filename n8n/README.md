# Botsab × n8n Workflows

Two ready-to-import n8n workflows for automating WhatsApp group messaging.

---

## Workflow 1 — Anniversary Reminders (`reminders.json`)

Reads a Google Sheet daily, finds upcoming anniversaries, and sends reminder messages to a WhatsApp group.

### Google Sheet format

| Name | Date | Type | InstanceID | GroupID | CustomMessage |
|------|------|------|------------|---------|---------------|
| John Doe | 06-15 | Birth Anniversary | 5ce0ad2e_shack | 120363XXXXXXX@g.us | |
| Jane Smith | 03-22 | Death Anniversary | 5ce0ad2e_shack | 120363XXXXXXX@g.us | Remembering {{name}} today 🙏 |

- **Date** — `MM-DD` format (month-day, recurring every year)
- **Type** — Free text: "Birth Anniversary", "Death Anniversary", "Work Anniversary", etc.
- **InstanceID** — Find on the Botsab Instances page
- **GroupID** — Find on the Botsab Groups page (e.g. `120363XXXXXXX@g.us`)
- **CustomMessage** — Optional. Supports placeholders: `{{name}}`, `{{type}}`, `{{days}}`

### Reminder schedule

Reminders fire at **9 AM** (server timezone) on these thresholds: **35, 14, 7, 3, 1 days before**, and **on the day**.

### Setup steps

1. Import `reminders.json` into n8n (Settings → Import workflow)
2. In **Read Anniversary Sheet**: replace `REPLACE_WITH_YOUR_GOOGLE_SHEET_ID` with your sheet ID (from the URL)
3. Set up a **Google Sheets OAuth2** credential in n8n and attach it to that node
4. In **Send Group Message**: create an **HTTP Header Auth** credential:
   - Name: `x-api-key`
   - Value: your Botsab API key (copy from Botsab → API Keys page)
5. If Botsab runs on a different host, update the URL in **Send Group Message**
6. Activate the workflow

---

## Workflow 2 — Group Assistant Bot (`assistant-bot.json`)

Listens for `@mentions` of the bot in any WhatsApp group, sends the question to Claude AI, and replies in the group.

### How it works

```
Someone tags @bot "What is the weather in Mumbai?"
    ↓
Botsab fires message.received webhook → n8n
    ↓
Checks: isGroup=true AND isMentioned=true
    ↓
Strips @mention, sends query to Claude Haiku
    ↓
Posts AI reply back to the group
```

### Setup steps

1. Import `assistant-bot.json` into n8n
2. In **Receive Botsab Webhook**: copy the webhook URL (shown in n8n after saving)
3. In Botsab → Instances → (your instance) → Webhooks:
   - Set webhook URL to the n8n URL from step 2
   - Subscribe to event: `message.received`
4. In **Call Claude AI**: replace `REPLACE_WITH_YOUR_ANTHROPIC_API_KEY` with your Anthropic API key
   - Or swap the node for an OpenAI node if preferred
5. In both **Reply to Group** nodes: attach your Botsab **HTTP Header Auth** credential (same as in Workflow 1)
6. Activate the workflow

### Customizing the system prompt

Edit the **Call Claude AI** node → `system` field. Default:
> "You are a helpful WhatsApp group assistant. Keep responses concise (under 300 words). Be friendly and helpful. No markdown formatting — plain text only."

---

## Finding your Group ID

Go to **Botsab → Groups** in the dashboard, select your instance, and click the copy icon next to any group.

## Notes

- Both workflows assume Botsab runs at `http://localhost:3000`. Update URLs if deployed remotely.
- For the bot to detect mentions, someone must actually `@mention` the bot's number in the group (not just write its name).
- The bot does **not** respond to its own messages — `fromMe` messages are filtered out at the Botsab level.
