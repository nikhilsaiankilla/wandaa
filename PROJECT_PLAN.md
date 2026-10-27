# Wandaa project plan

This file tracks delivery. Check off a task only when its acceptance criteria are met. `wanda.md` remains the product vision; this file is the working build plan.

Items marked "built" below are implemented in code and type-checked but have not run against the live database or Telegram yet, so they are checked on the code and still need the manual checks further down.

## MVP: Telegram foundation

### Database foundation

- [x] Add PostgreSQL connection configuration and a reusable `getDb()` entry point.
- [x] Define tables for tasks, daily logs, habits, metrics, drafts, and notification history.
- [x] Add a local PostgreSQL service and generate the initial migration.
- [ ] Add `DATABASE_URL` for the chosen PostgreSQL service and apply the initial migration. (The expanded schema adds tables and enum values, so regenerate the migration first.)
- [ ] Verify database connection and create/read/update a task.

### 0. Project setup

- [x] Confirm deployment host and how secrets will be stored.
- [x] Create a Telegram bot with BotFather and record its token in local environment configuration (never commit it).
- [x] Find the owner Telegram user ID and configure the allowlist.
- [x] Add an `.env.example` containing variable names only, and ensure real env files are ignored by Git.
- [x] Decide the MVP persistence option before implementing storage; keep it small and back it up.

**Done when:** a local app can start with documented configuration, and secrets are not tracked by Git.

### 1. Telegram bot and access control

- [x] Add the smallest Telegram bot integration that fits the existing Next.js app and deployment host.
- [x] Reject messages and callbacks from every Telegram user except the configured owner.
- [x] Add a basic `/start` response and a useful response for unsupported commands.
- [x] Record enough runtime errors to diagnose failed bot updates without logging tokens or private message contents.

**Done when:** the owner can use the bot, unauthorized users get no assistant actions, and failures are visible.

### 2. Data and task capture

- [x] Define and persist tasks with text, status, due date (optional), and created/updated timestamps. (Built.)
- [x] Parse a simple `add: <task>` message; confirm the saved task in Telegram. (Built.)
- [x] Add buttons to mark a task done or drop it; handle repeated taps safely. (Built: repeated taps reply "already done".)
- [x] Add a command to list open tasks. (Built: `/tasks`.)

**Done when:** tasks survive restarts, can be listed and updated, and malformed input gets a clear reply.

### 3. Daily log and check-ins

- [x] Save an evening reply as a dated daily log. (Built: plain-language reply, `/log`, or a voice note.)
- [ ] Ask a short sleep-hours and energy question and save the answers with the same date. (`/sleep` saves them, but the evening prompt only invites sleep and energy instead of asking a direct question.)
- [x] Let the owner request or correct that day's entry. (Built: `/log` reads it, `/log <text>` replaces it, `/sleep` updates sleep.)
- [ ] Keep the first version text-only; add voice transcription only when a provider and privacy approach are chosen. (Voice notes are already built with OpenAI transcription, so record the provider and privacy decision, or remove voice for now.)

**Done when:** entries are date-stamped, retrievable, and a repeated update does not silently create duplicate check-ins.

### 4. Morning and evening rhythm

- [ ] Configure the morning plan and evening check-in times and timezone. (Timezone is `WANDA_TIMEZONE`; the times come from the scheduler and are not set up yet.)
- [x] Send the morning plan with open tasks and today's dated items. (Built: due and overdue tasks, habits, yesterday's recap.)
- [x] Send the evening prompt once per day. (Built.)
- [x] Persist a delivery marker so a restart or retry does not send duplicate scheduled prompts. (Built: `job_runs` has a unique job and day.)
- [x] Surface scheduler failures in logs and provide a simple health check. (Built: failures are logged and sent to Telegram once per outage, and `/status` shows each job's last success.)

**Done when:** both prompts arrive at the configured local times, and missed/failed jobs can be diagnosed.

## Delivery checks

Run these before considering an MVP change ready:

- [x] `npm run lint`
- [x] `npx tsc --noEmit`
- [ ] `npm run build`
- [x] Manually verify the owner can reach the bot and receive `/start` in Telegram.
- [ ] Manually verify non-owner access is rejected, task add/list/done, daily log save/read, and scheduled delivery in a non-production bot environment.
- [ ] Check that logs and repository diffs contain no tokens, webhook secrets, or private user data.

## Deployment checklist

- [ ] Choose a host that supports the app's required server routes and a reliable scheduled-job or polling mechanism.
- [ ] Configure production secrets and owner ID in the host's secret manager; do not copy `.env` into the repository.
- [x] Configure Telegram webhook URL and secret (or document the chosen polling setup) and verify Telegram can reach it.
- [ ] Provision durable storage and backups; confirm data survives a redeploy.
- [ ] Deploy a staging instance and complete the manual checks above with a test bot.
- [ ] Deploy production, verify `/start`, task capture, scheduled jobs, logs, and rollback procedure.
- [ ] Write down the production URL, deploy steps, backup/restore steps, and who receives failure alerts in the project README.

## Later phases

Track only after the MVP is in regular use; split each selected item into acceptance-checked tasks before implementation.

- [x] Weekly review from stored logs and task outcomes. (Built: `/week new` and the Sunday job.)
- [ ] Habit and streak tracking. (Habits and daily check-offs are built; streaks are not.)
- [ ] Sales, signup, refund, payment-failure, uptime, and cost alerts; prefer webhooks and deduplicate events. (Sales and refund webhook with deduplication is built; the rest are not.)
- [ ] X post drafts with approve, edit, and reject actions; never publish without approval. (Drafting, approve and reject are built; edit is not.)
- [ ] Calendar, GitHub, email triage, voice notes, goals, job search, and deployment controls, chosen one at a time. (Voice notes, goals and job search are built; calendar, GitHub, email triage and deployment controls are not.)

## Decisions to record

- Deployment host: TBD
- Persistence: PostgreSQL with Drizzle; production provider TBD
- Bot update mode (webhook or polling): webhook
- Morning plan time and timezone: TBD
- Evening check-in time: TBD
- First alert integration after MVP: sales alerts via a generic webhook; payment provider TBD
