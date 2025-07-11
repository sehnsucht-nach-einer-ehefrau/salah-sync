// src/app/api/update-state/route.ts

import { kv } from "@vercel/kv";
import { type NextRequest, NextResponse } from "next/server";
import { UserSettings } from "@/lib/schedule-logic";

export async function POST(request: NextRequest) {
  const userKey = "user_settings";
  try {
    const body = await request.json();
    const { action } = body;

    const settings = await kv.get<UserSettings>(userKey);
    if (!settings) {
      return NextResponse.json(
        { error: "User settings not found." },
        { status: 404 },
      );
    }

    const updatedSettings = { ...settings };
    const now = new Date().toISOString();

    switch (action) {
      case "toggle_mode":
        updatedSettings.mode =
          settings.mode === "downtime" ? "strict" : "downtime";

        updatedSettings.lastNotifiedActivity = "";
        if (updatedSettings.downtime) {
          updatedSettings.downtime.lastNotifiedActivity = "";
          updatedSettings.downtime.currentActivity = "Starting...";
        }
        break;

      case "set_meal_mode":
        updatedSettings.mealMode = body.mode;
        break;

      case "toggle_grip_enabled":
        if (updatedSettings.downtime) {
          updatedSettings.downtime.gripStrengthEnabled = body.isEnabled;
        }
        break;

      case "complete_grip":
        if (updatedSettings.downtime) {
          updatedSettings.downtime.lastGripTime = now;
          updatedSettings.downtime.currentActivity = "Starting...";
          updatedSettings.downtime.lastNotifiedActivity =
            "Grip Strength Training";
        }
        break;

      default:
        throw new Error("Invalid action");
    }

    await kv.set(userKey, updatedSettings);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in update-state:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
