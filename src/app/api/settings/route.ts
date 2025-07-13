// src/app/api/settings/route.ts

import { kv } from "@vercel/kv";
import { type NextRequest, NextResponse } from "next/server";
import { UserSettings, MealMode, CustomActivity } from "@/lib/types";

// Define a type for the old settings structure for safe migration
type LegacySettings = Omit<UserSettings, 'customActivities'> & { schedule: CustomActivity[] };

function isLegacySettings(settings: unknown): settings is LegacySettings {
  return (
    typeof settings === 'object' &&
    settings !== null &&
    'schedule' in settings &&
    !('customActivities' in settings)
  );
}
import { randomUUID } from "crypto";

const defaultCustomActivities: CustomActivity[] = [
  { id: 'read-quran', name: 'Read Quran', type: 'filler' },
  { id: 'work-out', name: 'Work Out', type: 'action', duration: 60 },
  { id: 'arabic-studies', name: 'Arabic Studies', type: 'action', duration: 45 },
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

    // Ensure backward compatibility fields exist
    if (!('latitude' in settings) && settings.location) {
      (settings as UserSettings).latitude = settings.location.latitude;
      (settings as UserSettings).longitude = settings.location.longitude;
      (settings as UserSettings).city = settings.location.city;
    }
    if (!('timezone' in settings) || !settings.timezone) {
      // Attempt to infer timezone from server if missing
      (settings as UserSettings).timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    }

    // Data migration for users from old versions
    if (isLegacySettings(settings)) {
      const { schedule, ...rest } = settings;
      const migratedSettings: UserSettings = {
        ...rest,
        customActivities: schedule || defaultCustomActivities,
      };
      await kv.set(userKey, migratedSettings);
      return NextResponse.json(migratedSettings);
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

type Action = "toggle_mode" | "set_meal_mode" | "toggle_grip_enabled" | "setup_location" | "add_activity" | "remove_activity" | "log_meal" | "update_activities" | "next_downtime_activity" | "start_grip_strength" | "resume_downtime_activity";

interface RequestBody {
  action: Action;
  mode?: MealMode;
  isEnabled?: boolean;
  latitude?: number;
  longitude?: number;
  city?: string;
  timezone?: string;
  activity?: Omit<CustomActivity, 'id'>;
  afterActivityId?: string;
  activityId?: string;
  meal?: { mealType: MealMode; description: string };
  activities?: CustomActivity[];
}

const actionHandlers: Record<Action, (settings: UserSettings | null, body: RequestBody) => UserSettings> = {
  setup_location: (_, body) => {
    const { latitude, longitude, city, timezone } = body;
    if (latitude === undefined || longitude === undefined || !city || !timezone) {
      throw new Error("Missing location data for setup.");
    }
    return {
      // Legacy flat fields for backwards compatibility
      latitude,
      longitude,
      timezone,
      city,

      // New structured location fields
      location: {
        city,
        country: 'USA', // Country was not stored before, add a default
        latitude,
        longitude,
      },
      calculationMethod: '2', // ISNA
      madhab: 'hanafi', // Hanafi
      customActivities: defaultCustomActivities,
      downtimeMode: false, // Add missing downtimeMode property
      mealMode: 'maintain',
      meals: {
        cut: { breakfast: '', lunch: '', dinner: '' },
        maintain: { breakfast: '', lunch: '', dinner: '' },
        bulk: { breakfast: '', lunch: '', dinner: '' },
      },
      foodLog: [], // Correctly named property
      lastNotifiedActivity: null,
    };
  },
  add_activity: (settings, body) => {
    if (!settings) throw new Error("Settings not initialized.");
    if (!body.activity) throw new Error("Activity data is missing.");

    const newActivity: CustomActivity = { ...body.activity, id: randomUUID() };
    const currentActivities = settings.customActivities || [];
    const newActivities = [...currentActivities];

    if (body.afterActivityId) {
      const index = newActivities.findIndex(a => a.id === body.afterActivityId);
      if (index !== -1) {
        newActivities.splice(index + 1, 0, newActivity);
      } else {
        newActivities.push(newActivity); // Fallback to adding at the end
      }
    } else {
      newActivities.push(newActivity);
    }

    return { ...settings, customActivities: newActivities };
  },
  remove_activity: (settings, body) => {
    if (!settings) throw new Error("Settings not initialized.");
    if (!body.activityId) throw new Error("Activity ID is missing.");

    const updatedActivities = (settings.customActivities || []).filter(
      (activity) => activity.id !== body.activityId
    );

    return { ...settings, customActivities: updatedActivities };
  },
  toggle_mode: (settings) => {
    if (!settings) throw new Error("Cannot toggle mode on uninitialized settings.");
    
    const newMode = settings.downtimeMode ? false : true;
    let downtime = settings.downtime;

    if (newMode && (!downtime || !downtime.activities || downtime.activities.length === 0)) {
      const defaultDowntimeActivities: CustomActivity[] = [
        { id: 'quran-downtime', name: "Quran Reading", type: 'action', duration: 30 },
        { id: 'leetcode-downtime', name: "LeetCode Session", type: 'action', duration: 30 },
      ];
      downtime = {
        activities: defaultDowntimeActivities,
        currentActivityIndex: 0,
        currentActivityStartTime: Date.now(),
        gripStrengthEnabled: true,
        lastGripTime: 0,
        startTime: "22:00", // Add default start time
        endTime: "06:00",   // Add default end time
      };
    }

    return {
      ...settings,
      downtimeMode: newMode,
      lastNotifiedActivity: "",
      downtime,
    };
  },
  set_meal_mode: (settings, body) => {
    if (!settings) throw new Error("Cannot set meal mode on uninitialized settings.");
    if (!body.mode || !["bulking", "maintenance", "cutting", "log"].includes(body.mode)) {
      throw new Error("Invalid 'mode' for set_meal_mode action.");
    }
    return { ...settings, mealMode: body.mode };
  },
  toggle_grip_enabled: (settings, body) => {
    if (!settings || !settings.downtime) throw new Error("Cannot toggle grip on uninitialized settings.");
    if (typeof body.isEnabled !== "boolean") {
      throw new Error("Invalid 'isEnabled' flag for toggle_grip_enabled action.");
    }
    return {
      ...settings,
      downtime: { ...settings.downtime, gripStrengthEnabled: body.isEnabled },
    };
  },
  log_meal: (settings, body) => {
    if (!settings) throw new Error("Cannot log meal to uninitialized settings.");
    if (!body.meal) throw new Error("Meal data is missing.");
    const newLog = { entry: body.meal.description, timestamp: new Date().toISOString() };
    const foodLog = [ ...(settings.foodLog || []), newLog ];
    return { ...settings, foodLog };
  },
  update_activities: (settings, body) => {
    if (!settings) throw new Error("Cannot update activities on uninitialized settings.");
    if (!body.activities) throw new Error("Activities data is missing.");
    return { ...settings, customActivities: body.activities };
  },
  next_downtime_activity: (settings) => {
    if (!settings || !settings.downtime) throw new Error("Downtime not configured");
    const { downtime } = settings;
    const activities = downtime.activities || [];
    if (activities.length === 0) throw new Error("Downtime not configured");

    const currentIndex = downtime.currentActivityIndex ?? 0;
    const nextIndex = (currentIndex + 1) % activities.length;
    return {
      ...settings,
      downtime: {
        ...downtime,
        currentActivityIndex: nextIndex,
        currentActivityStartTime: Date.now(),
        pausedState: undefined, // Clear any paused state
      }
    };
  },
  start_grip_strength: (settings) => {
    if (!settings || !settings.downtime) throw new Error("Downtime not configured");
    const { downtime } = settings;
    if (downtime.pausedState) return settings; // Already paused

    const { activities, currentActivityIndex, currentActivityStartTime } = downtime;
    if (!activities || typeof currentActivityIndex !== 'number' || !currentActivityStartTime) throw new Error("Downtime state is incomplete.");

    const currentActivity = activities[currentActivityIndex];
    if (typeof currentActivity.duration !== 'number') return settings; // Cannot pause an activity without a duration

    const elapsed = Date.now() - currentActivityStartTime; // in ms
    const durationInMs = currentActivity.duration * 60 * 1000;
    const remainingTime = Math.max(0, durationInMs - elapsed);

    const pausedState = {
      activity: currentActivity,
      remainingTime,
    };

    const gripActivity: CustomActivity = { id: 'grip-strength', name: "Grip Strength Training", type: 'action', duration: 1 };

    return {
      ...settings,
      downtime: {
        ...downtime,
        activities: [gripActivity, ...activities],
        currentActivityIndex: 0,
        currentActivityStartTime: Date.now(),
        lastGripTime: Date.now(),
        pausedState: pausedState,
      }
    };
  },
  resume_downtime_activity: (settings) => {
    if (!settings || !settings.downtime || !settings.downtime.pausedState) {
      throw new Error("No paused activity to resume");
    }
    const { downtime } = settings;
    const { activities, pausedState } = downtime;
    if (!pausedState) throw new Error("No paused activity to resume");

    // Filter out the temporary grip activity
    const originalActivities = (activities || []).filter(a => a.id !== 'grip-strength');
    const originalActivityId = pausedState.activity.id;
    const originalIndex = originalActivities.findIndex(a => a.id === originalActivityId);

    return {
      ...settings,
      downtime: {
        ...downtime,
        activities: originalActivities,
        currentActivityIndex: originalIndex !== -1 ? originalIndex : 0,
        currentActivityStartTime: Date.now(),
        pausedState: undefined,
      }
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