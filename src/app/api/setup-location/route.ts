// app/api/setup-location/route.ts

import { kv } from "@vercel/kv";
import { type NextRequest, NextResponse } from "next/server";
import { UserSettings } from "@/lib/schedule-logic";

// Type guard to check if an object conforms to the UserSettings interface
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isUserSettings(obj: any): obj is UserSettings {
  return (
    typeof obj === "object" &&
    obj !== null &&
    typeof obj.latitude === "number" &&
    typeof obj.longitude === "number" &&
    typeof obj.timezone === "string" &&
    typeof obj.city === "string" &&
    obj.mode === "strict" &&
    ["bulking", "maintenance", "cutting"].includes(obj.mealMode) &&
    typeof obj.downtime === "object" &&
    obj.downtime !== null &&
    typeof obj.downtime.gripStrengthEnabled === "boolean" &&
    typeof obj.downtime.quranTurn === "boolean"
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Create a complete, default UserSettings object
    const initialSettings: UserSettings = {
      latitude: body.latitude,
      longitude: body.longitude,
      city: body.city || "N/A",
      timezone: body.timezone,
      mode: 'strict',
      mealMode: 'maintenance',
      lastNotifiedActivity: '',
      downtime: {
        lastNotifiedActivity: '',
        currentActivity: '',
        activityStartTime: null,
        lastGripTime: null,
        gripStrengthEnabled: true,
        quranTurn: true,
      },
    };
    
    // Validate the newly created object
    if (!isUserSettings(initialSettings)) {
      return NextResponse.json({ error: "Invalid or incomplete user settings provided." }, { status: 400 });
    }

    await kv.set("user_settings", initialSettings);

    return NextResponse.json({ success: true, settings: initialSettings });
  } catch (error: unknown) {
    console.error("Error in setup-location:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    return NextResponse.json({ error: "Internal Server Error", details: errorMessage }, { status: 500 });
  }
}
