// src/app/api/get-settings/route.ts

import { kv } from "@vercel/kv";
import { NextResponse } from "next/server";

export async function GET() {
  const userKey = "user_settings";
  try {
    const settings = await kv.get(userKey);
    if (!settings) {
      return NextResponse.json(
        { error: "Settings not found" },
        { status: 404 },
      );
    }
    return NextResponse.json(settings);
  } catch {
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
