// src/app/api/get-settings/route.ts

import { kv } from "@vercel/kv";
import { NextResponse } from "next/server";
import { UserSettings } from "@/lib/schedule-logic";

export async function GET() {
  const userKey = "user_settings";
  try {
    const settings = await kv.get<UserSettings>(userKey);
    if (!settings) {
      return NextResponse.json(
        { error: "Settings not found. Please set location first." },
        { status: 404 },
      );
    }
    return NextResponse.json(settings);
  } catch (error: unknown) {
    console.error("Failed to retrieve settings from KV:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    return NextResponse.json(
      { error: "Internal Server Error", details: errorMessage },
      { status: 500 },
    );
  }
}
