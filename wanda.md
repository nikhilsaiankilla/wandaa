# Wandaa

*A personal Jarvis you run entirely from Telegram.*

Planning document · Draft 1 · Owner: Nikhil

## 1. Vision

Wandaa is a private, always-on assistant that lives in a Telegram chat. It watches the things that matter to my work and life, pings me when something happens, helps me plan and review my days, and does things on my behalf (like drafting posts for X) with my approval. The goal is one place, one chat, for running my day as a solo founder and builder.

**Principles**

- **Chat first.** If it can’t be done from Telegram, it’s not part of the core.
- **Proactive, not just reactive.** Wandaa messages me; I don’t have to remember to open it.
- **Low-friction logging.** Anything I log must take about five seconds.
- **Ask before acting outward.** Reads are automatic; posting, deploying and sending need my tap.
- **Built for one user first.** No accounts, billing or onboarding until it proves itself.

## 2. What Wandaa does

### 2.1 Daily rhythm

- **Morning plan:** top three priorities, today’s tasks, calendar items, overnight sales or alerts.
- **During the day:** instant alerts (sales, failures), quick capture of tasks, ideas and links.
- **Evening check-in:** “What did you get done today?” I reply in plain language (text or voice) and Wandaa turns it into a structured log. It also asks a quick sleep and energy question.
- **Weekly review (Sunday):** a written recap of wins, what slipped, numbers, and a suggested focus for next week.

### 2.2 Task management

- Add tasks by chatting naturally (“add: fix OG image, tomorrow”).
- Mark done, reschedule, or drop with buttons.
- Unfinished tasks roll into the next morning plan with a gentle nudge.
- Natural-language reminders (“remind me Friday to renew the domain”).

### 2.3 Posting on X

- Wandaa drafts posts from my daily log, launches, milestones and sales.
- Each draft arrives with **Approve / Edit / Reject** buttons. Nothing posts without approval.
- A short “voice guide” keeps drafts sounding like me.

### 2.4 Product and sales updates

- Instant message when a sale, signup or refund happens, with a running total.
- Alerts for failed payments, downtime and error or cost spikes.
- On-demand metrics: ask “how is this product doing this week?” and get a quick answer.
- Quiet digest mode so pings don’t turn into noise.

### 2.5 Sleep and daily life

- One short message for sleep hours and energy level, logged in the evening or morning.
- Habit and streak tracking (gym, shipping, posting) with light nudges.
- Over time, the weekly review can show patterns between sleep, habits and output.

## 3. Suggested extras

- **Quick capture inbox:** forward any link, idea or voice note and it gets filed (voice is transcribed).
- **Voice in, text out:** speak the evening log instead of typing it.
- **Content pipeline:** turn the daily log into tweet ideas automatically.
- **Goal tracking:** monthly targets (revenue, posts, applications) with progress in the weekly review.
- **Job search tracker:** log applications and follow-up dates; remind me when one goes cold.
- **Focus mode:** “deep work 90 min” silences non-urgent pings and reports back after.
- **Deploy control:** check or trigger a deployment from chat, with confirmation.
- **Email triage:** surface only important emails such as customer replies.

## 4. How it fits together (conceptual)

Wandaa is one brain with senses and hands.

- **Senses (inputs):** Telegram messages, payment webhooks, analytics and uptime checks, GitHub activity, calendar, my evening replies.
- **Brain:** an OpenAI model that understands loose messages, routes them to the right action, and writes summaries over structured data.
- **Hands (outputs):** Telegram messages and buttons, posts to X, task changes, deploy triggers.
- **Memory:** one store of timestamped entries (tasks, daily logs, sleep and habits, metrics snapshots, drafts, notification history).
- **Heartbeat:** scheduled and polling jobs that run on a timer.

### 4.1 The two kinds of timed jobs

- **Scheduled jobs** run at fixed times: morning plan, evening check-in, weekly review.
- **Polling jobs** run every few minutes and check for change: new sales, failed payments, uptime, signups, cost spikes. They only message me when there is something to say.
- Prefer **webhooks** where a service offers them (instant and cheaper); use polling as the fallback.
- **Deduplication:** keep a “last seen” marker per source so I’m never told the same thing twice.

### 4.2 How the AI is used

- The model writes over **real data that has already been collected**; it is never the source of truth. This keeps summaries accurate.
- Cheaper model for routine work (classifying messages, daily recaps); stronger model for the weekly review and post drafting.
- Intent parsing: one message like “shipped pricing page, slept 6h, tweet about it” becomes three actions.
- A daily spending cap on model calls.

### 4.3 Integrations as plug-ins

Every integration follows the same shape: something it can **read**, something it can **do**, and something it can **alert on**. That way new services can be added without redesigning the core.

**Candidate integrations:** payments, GitHub, analytics and uptime, Google Calendar, Gmail, my own databases, deploy platform, X, notes app.

## 5. Safety and reliability

- **Lock to my Telegram user ID.** No one else can command the bot.
- **Secrets stay private.** Wandaa will hold keys to payments and X, so these live in secure configuration only.
- **Approval gates** on anything outward-facing, at least at the start.
- **Failure visibility:** if a scheduled or polling job breaks, Wandaa tells me. Silence must never be mistaken for “no news”.
- **Quiet hours:** no pings while I sleep unless it is urgent (downtime, payment failure).
- **Message budget:** morning plan, evening check-in, and urgent alerts only in between.
- **Cost caps** on AI usage to protect against loops or bugs.

## 6. Build phases

**Phase 1: Foundation** Telegram bot, locked to me. Task capture, morning plan, evening check-in, daily log storage.

**Phase 2: Review loop** Weekly summary with the AI, sleep and energy logging, basic habit tracking.

**Phase 3: Alerts** Sales and product webhooks, one service at a time, starting with payments. Polling jobs, deduplication and failure alerts.

**Phase 4: Outward actions** X drafting with approval buttons, voice guide, content ideas from the daily log.

**Phase 5: Expansion** Calendar, GitHub, email triage, voice notes, goal tracking, job search tracker, deploy control.

## 7. Success looks like

- I use the evening check-in on most days without feeling it’s a chore.
- I hear about every sale within seconds.
- The weekly review is accurate enough that I actually read it.
- Posting on X takes me one tap instead of a writing session.
- I open fewer dashboards because Wandaa already told me.

## 8. Open questions

- Stay private forever, or turn it into a product for others later?
- Which product should be the first alert source?
- What tone should Wandaa have: terse and efficient, or friendly and chatty?
- What time should the morning plan and evening check-in arrive?
- Which integrations matter most after payments?