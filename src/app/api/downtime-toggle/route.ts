// src/app/api/downtime-toggle/route.ts

import { kv } from "@vercel/kv";
import { type NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const downtimeMode: boolean = body.downtimeMode;

    // Validate the input from the request
    if (typeof downtimeMode !== "boolean") {
      return NextResponse.json(
        { error: "Invalid 'downtimeMode' value provided. Must be a boolean." },
        { status: 400 },
      );
    }

    const userKey = "user_settings";
    const userSettings = await kv.get<{
      latitude: number;
      longitude: number;
      timezone: string;
      lastNotifiedActivity: string;
      downtimeMode?: boolean; // Make property optional
    }>(userKey);

    if (!userSettings) {
      return NextResponse.json(
        { error: "User settings not found. Please set location first." },
        { status: 404 },
      );
    }

    // Update the user settings with the new downtime mode state
    await kv.set(userKey, { ...userSettings, downtimeMode: downtimeMode });

    return NextResponse.json({ success: true, downtimeMode: downtimeMode });

    // THIS IS THE FIX: Catch the error as 'unknown' instead of 'any'
  } catch (error: unknown) {
    console.error("Error in downtime-toggle API:", error);

    // Now, we check if it's a standard Error object to safely access its message
    let errorMessage = "An internal server error occurred.";
    if (error instanceof Error) {
      errorMessage = error.message;
    }

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
