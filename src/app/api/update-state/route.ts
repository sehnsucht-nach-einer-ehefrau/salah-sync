// src/app/api/update-state/route.ts

import { kv } from "@vercel/kv";
import { type NextRequest, NextResponse } from "next/server";
import { UserSettings, MealMode } from "@/lib/schedule-logic";

type Action = "toggle_mode" | "set_meal_mode" | "toggle_grip_enabled" | "complete_grip";

interface RequestBody {
  action: Action;
  mode?: MealMode;
  isEnabled?: boolean;
}

// =================================================================
//  ACTION HANDLERS
// =================================================================

const actionHandlers: Record<Action, (settings: UserSettings, body: RequestBody) => UserSettings> = {
  toggle_mode: (settings) => ({
    ...settings,
    mode: settings.mode === "downtime" ? "strict" : "downtime",
    lastNotifiedActivity: "", // Reset notification state on mode change
    downtime: {
      ...settings.downtime,
      lastNotifiedActivity: "",
      currentActivity: "Starting...",
    },
  }),
  set_meal_mode: (settings, body) => {
    if (!body.mode || !["bulking", "maintenance", "cutting"].includes(body.mode)) {
      throw new Error("Invalid 'mode' for set_meal_mode action.");
    }
    return { ...settings, mealMode: body.mode };
  },
  toggle_grip_enabled: (settings, body) => {
    if (typeof body.isEnabled !== "boolean") {
      throw new Error("Invalid 'isEnabled' flag for toggle_grip_enabled action.");
    }
    return {
      ...settings,
      downtime: { ...settings.downtime, gripStrengthEnabled: body.isEnabled },
    };
  },
  complete_grip: (settings) => ({
    ...settings,
    downtime: {
      ...settings.downtime,
      lastGripTime: new Date().toISOString(),
      currentActivity: "Starting...", // Go back to a neutral state
      lastNotifiedActivity: "Grip Strength Training",
    },
  }),
};

// =================================================================
//  MAIN API HANDLER
// =================================================================

export async function POST(request: NextRequest) {
  const userKey = "user_settings";
  try {
    const body: RequestBody = await request.json();
    const { action } = body;

    if (!action || !Object.keys(actionHandlers).includes(action)) {
      return NextResponse.json({ error: "Invalid action provided." }, { status: 400 });
    }

    const settings = await kv.get<UserSettings>(userKey);
    if (!settings) {
      return NextResponse.json({ error: "User settings not found. Please set location first." }, { status: 404 });
    }

    const handler = actionHandlers[action];
    const updatedSettings = handler(settings, body);

    await kv.set(userKey, updatedSettings);

    return NextResponse.json({ success: true, settings: updatedSettings });
  } catch (error: unknown) {
    console.error("Error in update-state:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown server error occurred.";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
