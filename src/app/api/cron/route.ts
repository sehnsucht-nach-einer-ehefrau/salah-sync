// src/app/api/cron/route.ts

import { kv } from "@vercel/kv";
import { type NextRequest, NextResponse } from "next/server";
// Import the shared logic from the new file
import { calculateStrictSchedule, PrayerTimes } from "@/lib/schedule-logic";

// Main Cron Job Handler
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userKey = "user_settings";
  const userSettings = await kv.get<{
    latitude: number;
    longitude: number;
    timezone: string;
    lastNotifiedActivity: string;
  }>(userKey);

  if (!userSettings?.latitude || !userSettings?.timezone) {
    return NextResponse.json({
      message: "User location/timezone not set up. Skipping.",
    });
  }

  const today = new Date();
  const url = `https://api.aladhan.com/v1/timings/${today.getDate()}-${today.getMonth() + 1}-${today.getFullYear()}?latitude=${userSettings.latitude}&longitude=${userSettings.longitude}&method=2`;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to fetch prayer times");

    const data = await response.json();
    const prayerTimes: PrayerTimes = data.data?.timings;
    if (!prayerTimes) throw new Error("Invalid prayer times data");

    // Use the single source of truth for scheduling
    const { current } = calculateStrictSchedule(
      prayerTimes,
      userSettings.timezone,
    );

    // The rest of the notification logic remains the same
    if (
      current.name !== userSettings.lastNotifiedActivity &&
      current.name !== "Transition"
    ) {
      const message = `🕐 <b>${current.name}</b>\n${current.description}`;

      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      const chatId = process.env.TELEGRAM_CHAT_ID;
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: "HTML",
        }),
      });

      await kv.set(userKey, {
        ...userSettings,
        lastNotifiedActivity: current.name,
      });

      return NextResponse.json({
        status: "notified",
        new_activity: current.name,
      });
    } else {
      return NextResponse.json({ status: "no-change", activity: current.name });
    }
  } catch (error) {
    console.error("Cron job execution error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}
