// src/app/api/settings/route.ts

import { kv } from "@vercel/kv";
import { type NextRequest, NextResponse } from "next/server";
import { UserSettings, MealMode, CustomActivity } from "@/lib/types";
import { randomUUID } from "crypto";

const defaultSchedule: CustomActivity[] = [
  { id: 'fajr', name: 'Fajr', type: 'action', duration: 15 },
  { id: 'dhuhr', name: 'Dhuhr', type: 'action', duration: 15 },
  { id: 'asr', name: 'Asr', type: 'action', duration: 15 },
  { id: 'maghrib', name: 'Maghrib', type: 'action', duration: 15 },
  { id: 'isha', name: 'Isha', type: 'action', duration: 15 },
];

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

    // Data migration: If settings from an old version are missing the schedule, add the default one.
    if (!settings.schedule || !Array.isArray(settings.schedule) || settings.schedule.length === 0) {
      settings.schedule = defaultSchedule;
      // Persist the migrated settings back to KV. No need to `await` this.
      kv.set(userKey, settings).catch(console.error);
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

type Action = "toggle_mode" | "set_meal_mode" | "toggle_grip_enabled" | "setup_location" | "add_activity" | "remove_activity" | "add_meal_log" | "update_schedule";

interface RequestBody {
  action: Action;
  // For set_meal_mode
  mode?: MealMode;
  // For toggle_grip_enabled
  isEnabled?: boolean;
  // For setup_location
  latitude?: number;
  longitude?: number;
  city?: string;
  timezone?: string;
  // For add_activity
  activity?: Omit<CustomActivity, 'id'>;
  afterActivityId?: string; // ID of the activity to insert after
  // For remove_activity
  activityId?: string;
  // For add_meal_log
  meal?: { mealType: MealMode; description: string };
  // For update_schedule
  schedule?: CustomActivity[];
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
      schedule: defaultSchedule,
      mealLog: [],
    };
  },
  add_activity: (settings, body) => {
    if (!settings) throw new Error("Cannot add activity to uninitialized settings.");
    if (!body.activity) throw new Error("Activity data is missing.");
    if (!body.afterActivityId) throw new Error("Target activity ID is missing.");

    const newActivity: CustomActivity = { ...body.activity, id: randomUUID() };
    const targetIndex = settings.schedule.findIndex(act => act.id === body.afterActivityId);
    if (targetIndex === -1) throw new Error("Target activity not found.");

    const newSchedule = [...settings.schedule];
    newSchedule.splice(targetIndex + 1, 0, newActivity);

    return { ...settings, schedule: newSchedule };
  },
  remove_activity: (settings, body) => {
    if (!settings) throw new Error("Cannot remove activity from uninitialized settings.");
    if (!body.activityId) throw new Error("Activity ID to remove is missing.");
    if (['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'].includes(body.activityId)) {
        throw new Error("Cannot remove prayer activities.");
    }
    
    const newSchedule = settings.schedule.filter(act => act.id !== body.activityId);
    return { ...settings, schedule: newSchedule };
  },
  toggle_mode: (settings) => {
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
  add_meal_log: (settings, body) => {
    if (!settings) throw new Error("Cannot add meal log to uninitialized settings.");
    if (!body.meal) throw new Error("Meal data is missing.");
    const newLog = { ...body.meal, id: randomUUID(), timestamp: new Date().toISOString() };
    const mealLog = [ ...(settings.mealLog || []), newLog ];
    return { ...settings, mealLog };
  },
  update_schedule: (settings, body) => {
    if (!settings) throw new Error("Cannot update schedule on uninitialized settings.");
    if (!body.schedule) throw new Error("Schedule data is missing.");
    return { ...settings, schedule: body.schedule };
  }
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