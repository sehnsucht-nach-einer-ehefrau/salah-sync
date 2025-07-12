// src/app/api/cron/route.ts

import { kv } from "@vercel/kv";
import { type NextRequest, NextResponse } from "next/server";
import { calculateSchedule } from "@/lib/schedule-logic";
import { UserSettings, DowntimeState } from "@/lib/types";
import { sendTelegram, getPrayerTimes } from "@/lib/utils";

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

  if (settings.mode === "strict") {
    // STRICT MODE LOGIC
    const { latitude, longitude, timezone, lastNotifiedActivity } = settings;

    const prayerTimes = await getPrayerTimes(latitude, longitude, timezone);
    if (!prayerTimes) {
      return NextResponse.json({ error: "Failed to get prayer times for strict mode." }, { status: 500 });
    }

    const { current } = calculateSchedule(settings, prayerTimes);

    if (current.name !== lastNotifiedActivity && current.name !== "Transition") {
      await sendTelegram(`🕐 <b>${current.name}</b>\n${current.description}`);
      await kv.set("user_settings", { ...settings, lastNotifiedActivity: current.name });
      return NextResponse.json({ status: "notified (strict)", new_activity: current.name });
    }

    return NextResponse.json({ status: "no-change (strict)", activity: current.name });

  } else if (settings.mode === "downtime") {
    // DOWNTIME MODE LOGIC
    const now = new Date();
    const downtimeConfig = settings.downtime || {};
    const downtime: DowntimeState = {
      gripStrengthEnabled: downtimeConfig.gripStrengthEnabled ?? true,
      quranTurn: downtimeConfig.quranTurn ?? true,
      lastNotifiedActivity: downtimeConfig.lastNotifiedActivity ?? "",
      currentActivity: downtimeConfig.currentActivity ?? "Starting...",
      activityStartTime: downtimeConfig.activityStartTime ?? null,
      lastGripTime: downtimeConfig.lastGripTime ?? null,
      timeRemainingOnPause: downtimeConfig.timeRemainingOnPause ?? null,
      activityBeforePause: downtimeConfig.activityBeforePause ?? null,
    };

    let newActivityName: string | null = null;
    let newActivityDescription = "";
    const updatedDowntime: Partial<DowntimeState> = {};
    const { currentActivity, activityStartTime, lastGripTime, gripStrengthEnabled } = downtime;

    const GRIP_INTERVAL = 5 * 60 * 1000; // 5 minutes
    const ACTIVITY_DURATION = 30 * 60 * 1000; // 30 minutes
    const GRIP_DURATION = 1 * 60 * 1000; // 1 minute

    // State Machine Logic
    if (currentActivity === "Grip Strength Training" && activityStartTime) {
      if (now.getTime() - new Date(activityStartTime).getTime() >= GRIP_DURATION) {
        newActivityName = downtime.activityBeforePause || (downtime.quranTurn ? "Quran Reading" : "LeetCode Session");
        newActivityDescription = `Grip training complete. Resuming: ${newActivityName}`;
        
        if (downtime.timeRemainingOnPause) {
          const timeAlreadyPassed = ACTIVITY_DURATION - downtime.timeRemainingOnPause;
          updatedDowntime.activityStartTime = new Date(now.getTime() - timeAlreadyPassed).toISOString();
        } else {
          updatedDowntime.activityStartTime = now.toISOString();
        }
        updatedDowntime.currentActivity = newActivityName;
        updatedDowntime.lastGripTime = now.toISOString();
        updatedDowntime.timeRemainingOnPause = null;
        updatedDowntime.activityBeforePause = null;
      }
    } else if (gripStrengthEnabled && (!lastGripTime || now.getTime() - new Date(lastGripTime).getTime() >= GRIP_INTERVAL)) {
      newActivityName = "Grip Strength Training";
      newActivityDescription = "Time for your 1-minute grip set!";
      
      if (activityStartTime && !["Starting...", "Grip Strength Training"].includes(currentActivity)) {
        const timePassed = now.getTime() - new Date(activityStartTime).getTime();
        const timeRemaining = ACTIVITY_DURATION - timePassed;
        if (timeRemaining > 0) {
          updatedDowntime.timeRemainingOnPause = timeRemaining;
          updatedDowntime.activityBeforePause = currentActivity;
        }
      }
      updatedDowntime.currentActivity = newActivityName;
      updatedDowntime.activityStartTime = now.toISOString();
    } else {
      const isActivityOver = !activityStartTime || ["Starting...", "Grip Strength Training"].includes(currentActivity) || (now.getTime() - new Date(activityStartTime).getTime()) >= ACTIVITY_DURATION;
      if (isActivityOver) {
        const nextQuranTurn = currentActivity === "Grip Strength Training" ? downtime.quranTurn : !downtime.quranTurn;
        newActivityName = nextQuranTurn ? "Quran Reading" : "LeetCode Session";
        newActivityDescription = `Starting 30-minute session: ${newActivityName}.`;

        updatedDowntime.quranTurn = nextQuranTurn;
        updatedDowntime.currentActivity = newActivityName;
        updatedDowntime.activityStartTime = now.toISOString();
        updatedDowntime.timeRemainingOnPause = null;
        updatedDowntime.activityBeforePause = null;
      }
    }

    if (newActivityName && newActivityName !== downtime.lastNotifiedActivity) {
      await sendTelegram(`💪 <b>${newActivityName}</b>\n${newActivityDescription}`);
      const finalDowntimeState = { ...downtime, ...updatedDowntime, lastNotifiedActivity: newActivityName };
      await kv.set("user_settings", { ...settings, downtime: finalDowntimeState });
      return NextResponse.json({ status: "notified (downtime)", new_activity: newActivityName });
    }

    return NextResponse.json({ status: "no-change (downtime)", activity: downtime.currentActivity || "Waiting..." });
  }

  return NextResponse.json({ status: "skipped", reason: `Unknown mode: ${settings.mode}` });
} 