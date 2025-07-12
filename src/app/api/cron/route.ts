// src/app/api/cron/route.ts

import { kv } from "@vercel/kv";
import { type NextRequest, NextResponse } from "next/server";
import { calculateSchedule } from "@/lib/schedule-logic";
import { UserSettings, ScheduleItem } from "@/lib/types";
import { sendTelegram, getPrayerTimes } from "@/lib/utils";
import { toZonedTime } from "date-fns-tz";

// =================================================================
//  MAIN CRON JOB HANDLER
// =================================================================

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await kv.get<UserSettings>("user_settings");
  if (!settings || !settings.latitude || !settings.longitude || !settings.timezone) {
    return NextResponse.json({ message: "User settings not configured." }, { status: 400 });
  }

  const now = toZonedTime(new Date(), settings.timezone);

  if (!settings.downtimeMode) {
    // STRICT MODE LOGIC
    const { latitude, longitude, timezone, lastNotifiedActivity } = settings;

    const prayerTimes = await getPrayerTimes(latitude, longitude, timezone);
    if (!prayerTimes) {
      return NextResponse.json({ error: "Failed to get prayer times for strict mode." }, { status: 500 });
    }

    const scheduleResult = calculateSchedule(settings, prayerTimes);
    const current = scheduleResult.schedule.find((item: ScheduleItem) => now >= item.startTime && now < item.endTime);

    if (current && current.name !== lastNotifiedActivity && current.name !== "Free Time") {
      await sendTelegram(`🕐 <b>${current.name}</b>\n${current.description}`);
      await kv.set("user_settings", { ...settings, lastNotifiedActivity: current.name });
      return NextResponse.json({ status: "notified (strict)", new_activity: current.name });
    }

    return NextResponse.json({ status: "no-change (strict)", activity: current?.name || 'N/A' });

  } else {
    // DOWNTIME MODE LOGIC (Cron Job)
    const { downtime, lastNotifiedActivity } = settings;

    if (!downtime || !downtime.activities || typeof downtime.currentActivityIndex !== 'number') {
      return NextResponse.json({ message: "Downtime not configured." }, { status: 400 });
    }

    const currentActivity = downtime.activities[downtime.currentActivityIndex];

    if (currentActivity && currentActivity.name !== lastNotifiedActivity) {
      const message = `🏃 <b>${currentActivity.name}</b>\n${currentActivity.duration}-minute session has started.`;
      await sendTelegram(message);
      await kv.set("user_settings", { ...settings, lastNotifiedActivity: currentActivity.name });
      return NextResponse.json({ status: "notified (downtime)", new_activity: currentActivity.name });
    }

    return NextResponse.json({ status: "no-change (downtime)", activity: currentActivity?.name || "N/A" });
  }

} 