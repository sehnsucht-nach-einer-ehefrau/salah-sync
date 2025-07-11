// src/app/api/settings/route.ts

import { kv } from "@vercel/kv";
import { type NextRequest, NextResponse } from "next/server";
import { UserSettings, MealMode, AppMode } from "@/lib/types";

// =================================================================
//  GET SETTINGS
// =================================================================

export async function GET() {
  const userKey = "user_settings";
  try {
    const settings = await kv.get<UserSettings>(userKey);
    if (!settings) {
      return NextResponse.json({ error: "Settings not found. Please set location first." }, { status: 404 });
    }
    return NextResponse.json(settings);
  } catch (error: unknown) {
    console.error("Failed to retrieve settings from KV:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    return NextResponse.json({ error: "Internal Server Error", details: errorMessage }, { status: 500 });
  }
}

// =================================================================
//  UPDATE SETTINGS (POST)
// =================================================================

type Action = "toggle_mode" | "set_meal_mode" | "toggle_grip_enabled" | "setup_location";

interface RequestBody {
  action: Action;
  mode?: MealMode;
  isEnabled?: boolean;
  latitude?: number;
  longitude?: number;
  city?: string;
  timezone?: string;
}

const actionHandlers: Record<Action, (settings: UserSettings | null, body: RequestBody) => UserSettings> = {
  setup_location: (_, body) => {
    const { latitude, longitude, city, timezone } = body;
    if (latitude === undefined || longitude === undefined || !city || !timezone) {
      throw new Error("Missing location data for setup.");
    }
    return {
      latitude,
      longitude,
      city,
      timezone,
      mode: 'strict',
      mealMode: 'maintenance',
      lastNotifiedActivity: "",
      downtime: {},
    };
  },
  toggle_mode: (settings, _) => {
    if (!settings) throw new Error("Cannot toggle mode on uninitialized settings.");
    return {
      ...settings,
      mode: settings.mode === "downtime" ? "strict" : "downtime",
      lastNotifiedActivity: "", // Reset notification state on mode change
      downtime: {
        ...settings.downtime,
        lastNotifiedActivity: "",
        currentActivity: "Starting...",
      },
    };
  },
  set_meal_mode: (settings, body) => {
    if (!settings) throw new Error("Cannot set meal mode on uninitialized settings.");
    if (!body.mode || !["bulking", "maintenance", "cutting"].includes(body.mode)) {
      throw new Error("Invalid 'mode' for set_meal_mode action.");
    }
    return { ...settings, mealMode: body.mode };
  },
  toggle_grip_enabled: (settings, body) => {
    if (!settings) throw new Error("Cannot toggle grip on uninitialized settings.");
    if (typeof body.isEnabled !== "boolean") {
      throw new Error("Invalid 'isEnabled' flag for toggle_grip_enabled action.");
    }
    const downtime = settings.downtime || {};
    return {
      ...settings,
      downtime: { ...downtime, gripStrengthEnabled: body.isEnabled },
    };
  },
};

export async function POST(request: NextRequest) {
  const userKey = "user_settings";
  try {
    const body: RequestBody = await request.json();
    const { action } = body;

    if (!action || !Object.keys(actionHandlers).includes(action)) {
      return NextResponse.json({ error: "Invalid action provided." }, { status: 400 });
    }
    
    // Allow setup_location even if settings don't exist yet
    if (action === 'setup_location') {
      const newSettings = actionHandlers.setup_location(null, body);
      await kv.set(userKey, newSettings);
      return NextResponse.json({ success: true, settings: newSettings });
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

// =================================================================
//  DELETE SETTINGS
// =================================================================

export async function DELETE() {
  const userKey = "user_settings";
  try {
    await kv.del(userKey);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete settings:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
} 