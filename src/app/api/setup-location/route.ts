// app/api/setup-location/route.ts

import { kv } from "@vercel/kv";
import { type NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    // CHANGE 1: Destructure timezone from the body
    const { latitude, longitude, city, timezone } = await request.json();

    if (
      latitude === undefined ||
      longitude === undefined ||
      timezone === undefined // Add a check for timezone
    ) {
      return NextResponse.json(
        { error: "Missing latitude, longitude, or timezone" },
        { status: 400 },
      );
    }

    const userKey = "user_settings";

    // CHANGE 2: Save the timezone to Vercel KV
    await kv.set(userKey, {
      latitude,
      longitude,
      city,
      timezone, // Now it's saved!
      lastNotifiedActivity: "",
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in setup-location:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
