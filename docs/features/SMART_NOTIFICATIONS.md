# Smart in-app notifications

Session-based reminders to improve daily tracking habits. Separate from **email** “Remind me to log time at end of day” (that flow is unchanged).

## Enabling for users

1. Open **Settings → Notifications**.
2. Under **In-app reminders (toasts)**, turn on **Enable smart notifications on this device**.
3. Choose which kinds to show (no-tracking nudge, long timer, daily summary) and optionally **browser notifications** (requires permission in the browser).

Optional **HH:MM** overrides apply to the **hour** used for time-window checks (same idea as the email reminder: the app uses the first `SMART_NOTIFY_SCHEDULER_SLOT_MINUTES` of that local hour). If left blank, server defaults from configuration apply.

## HTTP API (session auth)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/notifications` | Returns `{ "notifications": [...], "meta": { ... } }` when the feature is enabled for the user; empty list when disabled. |
| `POST` | `/api/notifications/dismiss` | JSON body: `{ "kind": "<kind>", "local_date": "YYYY-MM-DD" }`. Omit `local_date` to use the server-derived “today” in the user’s timezone. |

Stable `kind` values: `no_tracking_today`, `timer_running_long`, `daily_summary`.

`GET /api/summary/today` uses the same **user-local calendar day** as the notification service (for totals of **completed** entries).

## Server configuration (environment)

All optional; defaults are defined on `Config` in [`app/config.py`](../../app/config.py).

| Variable | Role |
|----------|------|
| `SMART_NOTIFY_MAX_PER_DAY` | Max notifications returned per request (default 2). |
| `SMART_NOTIFY_NO_TRACKING_AFTER` | Default `HH:MM` hour for the no-tracking nudge (default `16:00`). |
| `SMART_NOTIFY_SUMMARY_AT` | Default `HH:MM` hour for the daily summary window (default `18:00`). |
| `SMART_NOTIFY_LONG_TIMER_HOURS` | Hours after which an active timer triggers the long-timer alert (default `4`). |
| `SMART_NOTIFY_SCHEDULER_SLOT_MINUTES` | Length of the firing window at the start of the configured hour (default `30`). |

## Database

- Migration **`150_add_smart_notifications`**: new columns on `users`, table `user_smart_notification_dismissals`.

## Frontend

[`app/static/smart-notifications.js`](../../app/static/smart-notifications.js) polls `/api/notifications` on an interval and shows results via `toastManager`. Dismissals are sent when the toast closes (including auto-dismiss). [`app/static/toast-notifications.js`](../../app/static/toast-notifications.js) implements the optional `onDismiss` hook on `toastManager.show`.
