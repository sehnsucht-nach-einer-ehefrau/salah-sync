// src/app/api/downtime-cron/route.ts

import { kv } from "@vercel/kv";
import { type NextRequest, NextResponse } from "next/server";
import { UserSettings, DowntimeState } from "@/lib/schedule-logic";

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

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await kv.get<UserSettings>("user_settings");
  if (settings?.mode !== "downtime") {
    return NextResponse.json({ status: "skipped", reason: "Not in downtime mode." });
  }

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
  const { currentActivity, activityStartTime, lastGripTime } = downtime;

  // --- State Machine Logic ---

  // 1. If grip training is active, check if it's over.
  if (currentActivity === "Grip Strength Training" && activityStartTime) {
    if (now.getTime() - new Date(activityStartTime).getTime() >= 1 * 60 * 1000) {
      newActivityName = downtime.activityBeforePause || (downtime.quranTurn ? "Quran Reading" : "LeetCode Session");
      newActivityDescription = `Grip training complete. Resuming: ${newActivityName}`;
      
      if (downtime.timeRemainingOnPause) {
        const timeAlreadyPassed = (30 * 60 * 1000) - downtime.timeRemainingOnPause;
        updatedDowntime.activityStartTime = new Date(now.getTime() - timeAlreadyPassed).toISOString();
      } else {
        updatedDowntime.activityStartTime = now.toISOString();
      }
      updatedDowntime.currentActivity = newActivityName;
      updatedDowntime.lastGripTime = now.toISOString();
      updatedDowntime.timeRemainingOnPause = null;
      updatedDowntime.activityBeforePause = null;
    }
  }
  // 2. If not doing grip training, check if it's time to start.
  else if (downtime.gripStrengthEnabled && (!lastGripTime || now.getTime() - new Date(lastGripTime).getTime() >= 30 * 60 * 1000)) {
    newActivityName = "Grip Strength Training";
    newActivityDescription = "Time for your 1-minute grip set!";
    
    if (activityStartTime && !["Starting...", "Grip Strength Training"].includes(currentActivity)) {
      const timePassed = now.getTime() - new Date(activityStartTime).getTime();
      const timeRemaining = (30 * 60 * 1000) - timePassed;
      if (timeRemaining > 0) {
        updatedDowntime.timeRemainingOnPause = timeRemaining;
        updatedDowntime.activityBeforePause = currentActivity;
      }
    }
    updatedDowntime.currentActivity = newActivityName;
    updatedDowntime.activityStartTime = now.toISOString();
  }
  // 3. If no grip training is happening or pending, check the main activity.
  else {
    const isActivityOver = !activityStartTime || ["Starting...", "Grip Strength Training"].includes(currentActivity) || (now.getTime() - new Date(activityStartTime).getTime()) >= 30 * 60 * 1000;
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

  // --- End of State Machine ---

  if (newActivityName && newActivityName !== downtime.lastNotifiedActivity) {
    await sendTelegram(`💪 <b>${newActivityName}</b>\n${newActivityDescription}`);
    const finalDowntimeState = { ...downtime, ...updatedDowntime, lastNotifiedActivity: newActivityName };
    await kv.set("user_settings", { ...settings, downtime: finalDowntimeState });
    return NextResponse.json({ status: "notified (downtime)", new_activity: newActivityName });
  }

  return NextResponse.json({ status: "no-change (downtime)", activity: downtime.currentActivity || "Waiting..." });
} 