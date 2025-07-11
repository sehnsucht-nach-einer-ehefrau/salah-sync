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
  const downtime: DowntimeState = {
    ...(settings.downtime || {}),
    gripStrengthEnabled: settings.downtime?.gripStrengthEnabled ?? true,
    quranTurn: settings.downtime?.quranTurn ?? true,
    lastNotifiedActivity: settings.downtime?.lastNotifiedActivity ?? "",
    currentActivity: settings.downtime?.currentActivity ?? "Starting...",
    activityStartTime: settings.downtime?.activityStartTime ?? null,
    lastGripTime: settings.downtime?.lastGripTime ?? null,
    timeRemainingOnPause: settings.downtime?.timeRemainingOnPause ?? null,
    activityBeforePause: settings.downtime?.activityBeforePause ?? null,
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
    
    // Pause the main activity if it was running
    if (downtime.currentActivity && downtime.activityStartTime && !["Starting...", "Grip Strength Training"].includes(downtime.currentActivity)) {
        const startTime = new Date(downtime.activityStartTime);
        const timePassed = now.getTime() - startTime.getTime();
        const thirtyMinutes = 30 * 60 * 1000;
        const timeRemaining = thirtyMinutes - timePassed;
        
        if (timeRemaining > 0) {
            updatedDowntime.timeRemainingOnPause = timeRemaining;
            updatedDowntime.activityBeforePause = downtime.currentActivity;
        }
    }
    updatedDowntime.currentActivity = newActivityName;
  }
  
  // Check 2: If not doing grip training, is it time to switch the main activity?
  else if (downtime.currentActivity !== "Grip Strength Training") {
    const activityStartTime = downtime.activityStartTime ? new Date(downtime.activityStartTime) : null;
    const isActivityOver = !activityStartTime || ["Starting...", "Grip Strength Training"].includes(downtime.currentActivity) || (now.getTime() - activityStartTime.getTime()) / 60000 >= 30;

    if (isActivityOver) {
      const nextQuranTurn = !downtime.quranTurn;
      newActivityName = nextQuranTurn ? "Quran Reading" : "LeetCode Session";
      newActivityDescription = `Starting 30-minute session: ${newActivityName}.`;
      
      updatedDowntime.currentActivity = newActivityName;
      updatedDowntime.activityStartTime = now.toISOString();
      updatedDowntime.quranTurn = nextQuranTurn;
      // Clear any pause state
      updatedDowntime.timeRemainingOnPause = null;
      updatedDowntime.activityBeforePause = null;
    }
  }

  // If a new activity was determined, notify and update state.
  if (newActivityName && newActivityName !== downtime.lastNotifiedActivity) {
    await sendTelegram(`💪 <b>${newActivityName}</b>\n${newActivityDescription}`);
    
    const finalDowntimeState = { ...downtime, ...updatedDowntime, lastNotifiedActivity: newActivityName };
    await kv.set("user_settings", { ...settings, downtime: finalDowntimeState });
    
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
