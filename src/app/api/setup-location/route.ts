import { kv } from "@vercel/kv";
import { type NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { latitude, longitude, city } = await request.json();

    if (latitude === undefined || longitude === undefined) {
      return NextResponse.json(
        { error: "Missing latitude or longitude" },
        { status: 400 },
      );
    }

    // Use a fixed key for the single user of this app
    const userKey = "user_settings";

    // Store location and reset the last notified activity
    await kv.set(userKey, {
      latitude,
      longitude,
      city,
      lastNotifiedActivity: "", // Reset on new location setup
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
