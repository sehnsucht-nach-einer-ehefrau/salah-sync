// src/app/api/cron/route.ts

import { kv } from "@vercel/kv";
import { type NextRequest, NextResponse } from "next/server";
import {
  calculateSchedule,
  PrayerTimes,
  UserSettings,
} from "@/lib/schedule-logic";
import { toZonedTime } from "date-fns-tz";

async function sendTelegram(message: string) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) return;
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: "HTML",
    }),
  });
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userKey = "user_settings";
  const settings = await kv.get<UserSettings>(userKey);
  if (!settings?.latitude || !settings?.timezone) {
    return NextResponse.json({ message: "User settings not configured." });
  }

  const now = new Date();

  if (settings.mode === "strict" || !settings.mode) {
    const nowZoned = toZonedTime(now, settings.timezone);
    const prayerTimesResponse = await fetch(
      `https://api.aladhan.com/v1/timings/${nowZoned.getDate()}-${
        nowZoned.getMonth() + 1
      }-${nowZoned.getFullYear()}?latitude=${settings.latitude}&longitude=${
        settings.longitude
      }&method=2`,
    );
    const prayerData = await prayerTimesResponse.json();
    const prayerTimes: PrayerTimes = prayerData.data?.timings;
    if (!prayerTimes)
      return NextResponse.json({
        error: "Failed to get prayer times for strict mode.",
      });

    const { current } = calculateSchedule(
      prayerTimes,
      settings.timezone,
      settings.mealMode || "maintenance",
    );

    if (
      current.name !== settings.lastNotifiedActivity &&
      current.name !== "Transition"
    ) {
      await sendTelegram(`🕐 <b>${current.name}</b>\n${current.description}`);
      await kv.set(userKey, {
        ...settings,
        lastNotifiedActivity: current.name,
      });
      return NextResponse.json({
        status: "notified",
        new_activity: current.name,
      });
    }
    return NextResponse.json({ status: "no-change", activity: current.name });
  }

  if (settings.mode === "downtime") {
    const downtime = settings.downtime || {};
    let newActivityName: string | null = null;
    let newActivityDescription = "";
    const updatedDowntimeState = { ...downtime };

    // This logic now acts as a failsafe or resumes activity after a grip set.
    const needsResume = downtime.currentActivity === "Starting...";

    if (downtime.gripStrengthEnabled) {
      const lastGrip = downtime.lastGripTime
        ? new Date(downtime.lastGripTime)
        : null;
      // Prevent grip notification if a grip set was just completed.
      if (
        downtime.currentActivity !== "Grip Strength Training" &&
        (!lastGrip || now.getTime() - lastGrip.getTime() >= 5 * 60 * 1000)
      ) {
        newActivityName = "Grip Strength Training";
        newActivityDescription = "Time for your 5-minute grip set!";
      }
    }

    if (!newActivityName) {
      const activityStartTime = downtime.activityStartTime
        ? new Date(downtime.activityStartTime)
        : null;
      let switchActivity = needsResume;

      if (activityStartTime && !needsResume) {
        const minutesPassed =
          (now.getTime() - activityStartTime.getTime()) / 60000;
        if (minutesPassed >= 30) {
          switchActivity = true;
          updatedDowntimeState.quranTurn = !downtime.quranTurn;
        }
      }

      if (switchActivity) {
        updatedDowntimeState.activityStartTime = now.toISOString();
        newActivityName = updatedDowntimeState.quranTurn
          ? "Quran Reading"
          : "LeetCode Session";
        newActivityDescription = `Starting 30-minute session: ${newActivityName}.`;
      }
    }

    if (newActivityName && newActivityName !== downtime.lastNotifiedActivity) {
      await sendTelegram(
        `💪 <b>${newActivityName}</b>\n${newActivityDescription}`,
      );
      updatedDowntimeState.lastNotifiedActivity = newActivityName;
      updatedDowntimeState.currentActivity = newActivityName;
      await kv.set(userKey, { ...settings, downtime: updatedDowntimeState });
      return NextResponse.json({
        status: "notified (downtime)",
        new_activity: newActivityName,
      });
    }

    return NextResponse.json({
      status: "no-change (downtime)",
      activity: downtime.currentActivity || "Waiting...",
    });
  }

  return NextResponse.json({ error: "Unknown mode" }, { status: 500 });
}
