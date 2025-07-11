// src/app/api/cron/route.ts

import { kv } from "@vercel/kv";
import { type NextRequest, NextResponse } from "next/server";
import { calculateSchedule, PrayerTimes, UserSettings, DowntimeState } from "@/lib/schedule-logic";
import { toZonedTime } from "date-fns-tz";

// =================================================================
//  HELPER FUNCTIONS
// =================================================================

async function sendTelegram(message: string): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) {
    console.warn("Telegram credentials not found. Skipping notification.");
    return;
  }
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: "HTML" }),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error(`Telegram API Error: ${response.status}`, errorData);
    }
  } catch (error) {
    console.error("Failed to send Telegram message:", error);
  }
}

async function getPrayerTimes(latitude: number, longitude: number, timezone: string): Promise<PrayerTimes | null> {
  const nowZoned = toZonedTime(new Date(), timezone);
  const dateStr = `${nowZoned.getDate()}-${nowZoned.getMonth() + 1}-${nowZoned.getFullYear()}`;
  const url = `https://api.aladhan.com/v1/timings/${dateStr}?latitude=${latitude}&longitude=${longitude}&method=2`;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    return data.data?.timings || null;
  } catch (error) {
    console.error("Failed to fetch prayer times:", error);
    return null;
  }
}

// =================================================================
//  MODE-SPECIFIC HANDLERS
// =================================================================

async function handleStrictMode(settings: UserSettings) {
  const { latitude, longitude, timezone, mealMode = 'maintenance', lastNotifiedActivity } = settings;

  const prayerTimes = await getPrayerTimes(latitude!, longitude!, timezone!);
  if (!prayerTimes) return NextResponse.json({ error: "Failed to get prayer times for strict mode." }, { status: 500 });

  const { current } = calculateSchedule(prayerTimes, timezone!, mealMode);

  if (current.name !== lastNotifiedActivity && current.name !== "Transition") {
    await sendTelegram(`🕐 <b>${current.name}</b>\n${current.description}`);
    await kv.set("user_settings", { ...settings, lastNotifiedActivity: current.name });
    return NextResponse.json({ status: "notified (strict)", new_activity: current.name });
  }

  return NextResponse.json({ status: "no-change (strict)", activity: current.name });
}

async function handleDowntimeMode(settings: UserSettings) {
  const now = new Date();
  // Ensure downtime object exists with defaults
  const downtime: DowntimeState = {
    ...(settings.downtime || {}),
    gripStrengthEnabled: settings.downtime?.gripStrengthEnabled ?? true,
    quranTurn: settings.downtime?.quranTurn ?? true,
    lastNotifiedActivity: settings.downtime?.lastNotifiedActivity ?? "",
    currentActivity: settings.downtime?.currentActivity ?? "Starting...",
    activityStartTime: settings.downtime?.activityStartTime ?? null,
    lastGripTime: settings.downtime?.lastGripTime ?? null,
  };

  let newActivityName: string | null = null;
  let newActivityDescription = "";
  const updatedDowntime: Partial<DowntimeState> = {};

  // Check 1: Is it time for a grip strength set?
  const lastGripTime = downtime.lastGripTime ? new Date(downtime.lastGripTime) : null;
  const gripInterval = 30 * 60 * 1000; // 30 minutes
  if (downtime.gripStrengthEnabled && downtime.currentActivity !== "Grip Strength Training" && (!lastGripTime || now.getTime() - lastGripTime.getTime() >= gripInterval)) {
    newActivityName = "Grip Strength Training";
    newActivityDescription = "Time for your 5-minute grip set!";
    updatedDowntime.currentActivity = newActivityName;
    // Don't update activity start time for grip training
  }

  // Check 2: If not grip training, is it time to switch the main activity?
  else {
    const activityStartTime = downtime.activityStartTime ? new Date(downtime.activityStartTime) : null;
    // An activity is "over" if it's been 30+ minutes, or if the system is in a neutral state.
    const isActivityOver = !activityStartTime || ["Starting...", "Grip Strength Training"].includes(downtime.currentActivity) || (now.getTime() - activityStartTime.getTime()) / 60000 >= 30;

    if (isActivityOver) {
      // If the last activity was NOT a grip set, flip the turn.
      const nextQuranTurn = downtime.currentActivity !== "Grip Strength Training" ? !downtime.quranTurn : downtime.quranTurn;
      newActivityName = nextQuranTurn ? "Quran Reading" : "LeetCode Session";
      newActivityDescription = `Starting 30-minute session: ${newActivityName}.`;
      
      updatedDowntime.currentActivity = newActivityName;
      updatedDowntime.activityStartTime = now.toISOString();
      updatedDowntime.quranTurn = nextQuranTurn;
    }
  }

  // If a new activity was determined, notify and update state.
  if (newActivityName && newActivityName !== downtime.lastNotifiedActivity) {
    await sendTelegram(`💪 <b>${newActivityName}</b>\n${newActivityDescription}`);
    
    const finalDowntimeState = { ...downtime, ...updatedDowntime, lastNotifiedActivity: newActivityName };
    const finalSettings = { ...settings, downtime: finalDowntimeState };
    
    await kv.set("user_settings", finalSettings);
    
    // If the mode was just switched back to strict, immediately re-evaluate the schedule
    if (finalSettings.mode === "strict") {
        return handleStrictMode(finalSettings);
    }
    
    return NextResponse.json({ status: "notified (downtime)", new_activity: newActivityName });
  }

  return NextResponse.json({ status: "no-change (downtime)", activity: downtime.currentActivity || "Waiting..." });
}

// =================================================================
//  MAIN CRON JOB HANDLER
// =================================================================

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await kv.get<UserSettings>("user_settings");
  if (!settings?.latitude || !settings?.longitude || !settings?.timezone) {
    return NextResponse.json({ message: "User settings not configured." }, { status: 400 });
  }

  switch (settings.mode) {
    case "strict":
      return handleStrictMode(settings);
    case "downtime":
      return handleDowntimeMode(settings);
    default:
      // Default to strict mode if mode is not set
      return handleStrictMode(settings);
  }
}
