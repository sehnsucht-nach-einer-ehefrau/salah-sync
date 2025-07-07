// src/app/api/downtime-toggle/route.ts

import { kv } from "@vercel/kv";
import { type NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { downtimeModeActive } = await request.json();

    if (downtimeModeActive === undefined) {
      return NextResponse.json(
        { error: "Missing downtimeModeActive flag" },
        { status: 400 },
      );
    }

    const userKey = "user_settings";

    // Get existing settings to preserve them
    const settings = await kv.get<any>(userKey);
    if (!settings) {
      return NextResponse.json(
        { error: "User settings not found. Please set location first." },
        { status: 404 },
      );
    }

    // Update the flag and reset last notified activity to ensure the next cron run sends a notification
    await kv.set(userKey, {
      ...settings,
      downtimeModeActive,
      lastNotifiedActivity: "", // Critical: forces re-notification
      // Also reset downtime-specific state if we are turning it off
      downtimeState: downtimeModeActive
        ? settings.downtimeState || {
            quranTurn: true,
            lastGripTime: null,
            lastActivityTime: null,
          }
        : undefined,
    });

    return NextResponse.json({ success: true, newMode: downtimeModeActive });
  } catch (error) {
    console.error("Error in downtime-toggle:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
