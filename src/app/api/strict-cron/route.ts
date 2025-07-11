// src/app/api/strict-cron/route.ts

import { kv } from "@vercel/kv";
import { type NextRequest, NextResponse } from "next/server";
import { calculateSchedule, PrayerTimes, UserSettings } from "@/lib/schedule-logic";
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

  // This cron job only runs for 'strict' mode.
  if (settings.mode !== "strict") {
    return NextResponse.json({ status: "skipped", reason: "Not in strict mode." });
  }

  const { latitude, longitude, timezone, mealMode = 'maintenance', lastNotifiedActivity } = settings;

  const prayerTimes = await getPrayerTimes(latitude, longitude, timezone);
  if (!prayerTimes) {
    return NextResponse.json({ error: "Failed to get prayer times for strict mode." }, { status: 500 });
  }

  const { current } = calculateSchedule(prayerTimes, timezone, mealMode);

  if (current.name !== lastNotifiedActivity && current.name !== "Transition") {
    await sendTelegram(`🕐 <b>${current.name}</b>\n${current.description}`);
    await kv.set("user_settings", { ...settings, lastNotifiedActivity: current.name });
    return NextResponse.json({ status: "notified (strict)", new_activity: current.name });
  }

  return NextResponse.json({ status: "no-change (strict)", activity: current.name });
}
