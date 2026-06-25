// Convex cron jobs.
//
// Source: backend Celery tasks (no beat schedule was configured in
// source — these ran on-demand). We schedule them as proper crons:
//
//   - process_pending_notifications — every 5 minutes
//       Picks up scheduled notifications whose send time has come and
//       dispatches them via the notification_dispatch action.
//
//   - cleanup_old_assignments — daily @ 03:00 UTC
//       Soft-deletes assignments older than 90 days whose tour is
//       complete or cancelled. Keeps the working set small without
//       losing audit history.
//
//   - cleanup_old_notifications — daily @ 04:00 UTC
//       Hard-deletes notification logs older than 30 days and
//       completed scheduled notifications older than 30 days. Same
//       shape as source — these are operational artifacts.

import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Every 5 minutes — picks up pending scheduled notifications.
// Source ran this manually; we run on a fixed interval.
crons.interval(
	"process_pending_notifications",
	{ minutes: 5 },
	internal.notifications.processPendingNotifications,
);

// Daily at 03:00 UTC — archive stale assignments.
// We pick a low-traffic hour so the cleanup doesn't fight active
// reads/writes. Adjust if your peak load is in UTC.
crons.daily(
	"cleanup_old_assignments",
	{ hourUTC: 3, minuteUTC: 0 },
	internal.notifications.cleanupOldAssignments,
);

// Daily at 04:00 UTC — drop old notification artifacts.
// One hour after the assignments cleanup so we never run two
// heavy crons at the same time.
crons.daily(
	"cleanup_old_notifications",
	{ hourUTC: 4, minuteUTC: 0 },
	internal.notifications.cleanupOldNotifications,
);

export default crons;
