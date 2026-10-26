# Wandaa project plan

This file tracks delivery. Check off a task only when its acceptance criteria are met. `wanda.md` remains the product vision; this file is the working build plan.

## MVP: Telegram foundation

### 0. Project setup

- [ ] Confirm deployment host and how secrets will be stored.
- [ ] Create a Telegram bot with BotFather and record its token in local environment configuration (never commit it).
- [ ] Find the owner Telegram user ID and configure the allowlist.
- [ ] Add an `.env.example` containing variable names only, and ensure real env files are ignored by Git.
- [ ] Decide the MVP persistence option before implementing storage; keep it small and back it up.

**Done when:** a local app can start with documented configuration, and secrets are not tracked by Git.

### 1. Telegram bot and access control

- [ ] Add the smallest Telegram bot integration that fits the existing Next.js app and deployment host.
- [ ] Reject messages and callbacks from every Telegram user except the configured owner.
- [ ] Add a basic `/start` response and a useful response for unsupported commands.
- [ ] Record enough runtime errors to diagnose failed bot updates without logging tokens or private message contents.

**Done when:** the owner can use the bot, unauthorized users get no assistant actions, and failures are visible.

### 2. Data and task capture

- [ ] Define and persist tasks with text, status, due date (optional), and created/updated timestamps.
- [ ] Parse a simple `add: <task>` message; confirm the saved task in Telegram.
- [ ] Add buttons to mark a task done or drop it; handle repeated taps safely.
- [ ] Add a command to list open tasks.

**Done when:** tasks survive restarts, can be listed and updated, and malformed input gets a clear reply.

### 3. Daily log and check-ins

- [ ] Save an evening reply as a dated daily log.
- [ ] Ask a short sleep-hours and energy question and save the answers with the same date.
- [ ] Let the owner request or correct that day's entry.
- [ ] Keep the first version text-only; add voice transcription only when a provider and privacy approach are chosen.

**Done when:** entries are date-stamped, retrievable, and a repeated update does not silently create duplicate check-ins.

### 4. Morning and evening rhythm

- [ ] Configure the morning plan and evening check-in times and timezone.
- [ ] Send the morning plan with open tasks and today's dated items.
- [ ] Send the evening prompt once per day.
- [ ] Persist a delivery marker so a restart or retry does not send duplicate scheduled prompts.
- [ ] Surface scheduler failures in logs and provide a simple health check.

**Done when:** both prompts arrive at the configured local times, and missed/failed jobs can be diagnosed.

## Delivery checks

Run these before considering an MVP change ready:

- [ ] `npm run lint`
- [ ] `npx tsc --noEmit`
- [ ] `npm run build`
- [ ] Manually verify owner access, rejected non-owner access, task add/list/done, daily log save/read, and scheduled delivery in a non-production bot environment.
- [ ] Check that logs and repository diffs contain no tokens, webhook secrets, or private user data.

## Deployment checklist

- [ ] Choose a host that supports the app's required server routes and a reliable scheduled-job or polling mechanism.
- [ ] Configure production secrets and owner ID in the host's secret manager; do not copy `.env` into the repository.
- [ ] Configure Telegram webhook URL and secret (or document the chosen polling setup) and verify Telegram can reach it.
- [ ] Provision durable storage and backups; confirm data survives a redeploy.
- [ ] Deploy a staging instance and complete the manual checks above with a test bot.
- [ ] Deploy production, verify `/start`, task capture, scheduled jobs, logs, and rollback procedure.
- [ ] Write down the production URL, deploy steps, backup/restore steps, and who receives failure alerts in the project README.

## Later phases

Track only after the MVP is in regular use; split each selected item into acceptance-checked tasks before implementation.

- [ ] Weekly review from stored logs and task outcomes.
- [ ] Habit and streak tracking.
- [ ] Sales, signup, refund, payment-failure, uptime, and cost alerts; prefer webhooks and deduplicate events.
- [ ] X post drafts with approve, edit, and reject actions; never publish without approval.
- [ ] Calendar, GitHub, email triage, voice notes, goals, job search, and deployment controls, chosen one at a time.

## Decisions to record

- Deployment host: TBD
- Persistence: TBD
- Bot update mode (webhook or polling): TBD
- Morning plan time and timezone: TBD
- Evening check-in time: TBD
- First alert integration after MVP: TBD
