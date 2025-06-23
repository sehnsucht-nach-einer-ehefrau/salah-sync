import { type NextRequest, NextResponse } from "next/server";

interface PrayerTimes {
  Fajr: string;
  Dhuhr: string;
  Asr: string;
  Maghrib: string;
  Isha: string;
}

interface ScheduleItem {
  name: string;
  description: string;
  startTime: Date;
  endTime: Date;
}

async function fetchPrayerTimes(
  latitude: number,
  longitude: number
): Promise<PrayerTimes | null> {
  try {
    const today = new Date();
    const url = `https://api.aladhan.com/v1/timings/${today.getDate()}-${
      today.getMonth() + 1
    }-${today.getFullYear()}?latitude=${latitude}&longitude=${longitude}&method=2`;

    const response = await fetch(url);
    if (!response.ok) return null;

    const data = await response.json();
    return data.data?.timings || null;
  } catch (error) {
    console.error("Error fetching prayer times:", error);
    return null;
  }
}

function parseTime(timeString: string): Date {
  const [hours, minutes] = timeString.split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60000);
}

function subtractMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() - minutes * 60000);
}

function calculateCurrentActivity(
  prayerTimes: PrayerTimes
): ScheduleItem | null {
  const now = new Date();
  const fajrTime = parseTime(prayerTimes.Fajr);
  const dhuhrTime = parseTime(prayerTimes.Dhuhr);
  const asrTime = parseTime(prayerTimes.Asr);
  const maghribTime = parseTime(prayerTimes.Maghrib);
  const ishaTime = parseTime(prayerTimes.Isha);

  // Calculate if we need the 8+ hour sleep logic
  const tahajjudNormalTime = subtractMinutes(fajrTime, 60);
  const sleepStartTime = addMinutes(ishaTime, 30);

  let nightSleepMinutes = 0;
  if (tahajjudNormalTime.getTime() > sleepStartTime.getTime()) {
    nightSleepMinutes =
      (tahajjudNormalTime.getTime() - sleepStartTime.getTime()) / (1000 * 60);
  } else {
    const endOfDay = new Date(sleepStartTime);
    endOfDay.setHours(23, 59, 59, 999);
    const startOfNextDay = new Date(tahajjudNormalTime);
    startOfNextDay.setHours(0, 0, 0, 0);
    nightSleepMinutes =
      (endOfDay.getTime() -
        sleepStartTime.getTime() +
        (tahajjudNormalTime.getTime() - startOfNextDay.getTime())) /
      (1000 * 60);
  }

  const needsLongSleep = nightSleepMinutes > 480;

  let tahajjudStart: Date;
  let eatQuranStart: Date;
  let workoutStart: Date | null = null;

  if (needsLongSleep) {
    tahajjudStart = addMinutes(sleepStartTime, 480);
    eatQuranStart = addMinutes(tahajjudStart, 30);

    const eatQuranEnd = addMinutes(eatQuranStart, 30);
    const timeUntilFajr =
      (fajrTime.getTime() - eatQuranEnd.getTime()) / (1000 * 60);

    if (timeUntilFajr >= 60) {
      workoutStart = eatQuranEnd;
    }
  } else {
    tahajjudStart = tahajjudNormalTime;
    eatQuranStart = addMinutes(tahajjudStart, 30);
    workoutStart = addMinutes(eatQuranStart, 30);
  }

  const schedule: ScheduleItem[] = [];

  // Build complete schedule
  schedule.push({
    name: "Tahajjud",
    description:
      "Night prayer - Connect with Allah in the blessed hours (30 min)",
    startTime: tahajjudStart,
    endTime: addMinutes(tahajjudStart, 30),
  });

  schedule.push({
    name: "Eat + Quran",
    description: "Nourish your body and soul together (30 min)",
    startTime: eatQuranStart,
    endTime: addMinutes(eatQuranStart, 30),
  });

  if (workoutStart) {
    schedule.push({
      name: "Workout Session",
      description: "Physical training - Strengthen your body (1 hour)",
      startTime: workoutStart,
      endTime: addMinutes(workoutStart, 60),
    });

    const coldShowerStart = addMinutes(workoutStart, 60);
    schedule.push({
      name: "Cold Shower",
      description: "Refresh and energize yourself (5 min)",
      startTime: coldShowerStart,
      endTime: addMinutes(coldShowerStart, 5),
    });

    const leetcodeStart = addMinutes(coldShowerStart, 5);
    schedule.push({
      name: "LeetCode Session",
      description: "Sharpen your problem-solving skills (2 hours)",
      startTime: leetcodeStart,
      endTime: addMinutes(leetcodeStart, 120),
    });

    const bootdevStart = addMinutes(leetcodeStart, 120);
    schedule.push({
      name: "Boot.dev Session",
      description: "Learn backend development (1 hour)",
      startTime: bootdevStart,
      endTime: addMinutes(bootdevStart, 60),
    });

    const naflStart = addMinutes(bootdevStart, 60);
    schedule.push({
      name: "8 Rakat Nafl",
      description: "Voluntary prayer - Spiritual recharge (15 min)",
      startTime: naflStart,
      endTime: addMinutes(naflStart, 15),
    });

    const personalProjectsStart = addMinutes(naflStart, 15);
    schedule.push({
      name: "Personal Projects & Learning",
      description: "Build and create - Apply your knowledge",
      startTime: personalProjectsStart,
      endTime: dhuhrTime,
    });
  }

  schedule.push({
    name: "Fajr Prayer",
    description: "Dawn prayer - Start your day with gratitude (10 min)",
    startTime: fajrTime,
    endTime: addMinutes(fajrTime, 10),
  });

  schedule.push({
    name: "Dhuhr Prayer",
    description: "Midday prayer - Pause and remember Allah (20 min)",
    startTime: dhuhrTime,
    endTime: addMinutes(dhuhrTime, 20),
  });

  if (!needsLongSleep) {
    const napStart = addMinutes(dhuhrTime, 20);
    const napMinutes = Math.max(0, 480 - nightSleepMinutes);
    schedule.push({
      name: "Nap Time",
      description: `Rest and recharge (${
        Math.round((napMinutes / 60) * 10) / 10
      } hours for 8h total sleep)`,
      startTime: napStart,
      endTime: addMinutes(napStart, napMinutes),
    });

    const naflWarmupStart = addMinutes(napStart, napMinutes);
    schedule.push({
      name: "8 Rakat Nafl Warm Up",
      description: "Voluntary prayer - Prepare for responsibilities (15 min)",
      startTime: naflWarmupStart,
      endTime: addMinutes(naflWarmupStart, 15),
    });

    const responsibilitiesStart = addMinutes(naflWarmupStart, 15);
    schedule.push({
      name: "Responsibilities",
      description: "Handle your duties and commitments",
      startTime: responsibilitiesStart,
      endTime: asrTime,
    });
  }

  schedule.push({
    name: "Asr Prayer",
    description: "Afternoon prayer - Seek Allah's guidance (10 min)",
    startTime: asrTime,
    endTime: addMinutes(asrTime, 10),
  });

  const responsibilitiesAfterAsrStart = addMinutes(asrTime, 10);
  schedule.push({
    name: "Responsibilities",
    description: "Handle your duties and commitments",
    startTime: responsibilitiesAfterAsrStart,
    endTime: maghribTime,
  });

  schedule.push({
    name: "Maghrib Prayer",
    description: "Sunset prayer - Thank Allah for the day (10 min)",
    startTime: maghribTime,
    endTime: addMinutes(maghribTime, 10),
  });

  const eatStart = addMinutes(maghribTime, 10);
  schedule.push({
    name: "Eat",
    description: "Evening meal - Nourish yourself (30 min)",
    startTime: eatStart,
    endTime: addMinutes(eatStart, 30),
  });

  const windDownStart = addMinutes(eatStart, 30);
  schedule.push({
    name: "Wind Down Session",
    description: "Restroom + Warm Shower + Brush Teeth (30 min)",
    startTime: windDownStart,
    endTime: addMinutes(windDownStart, 30),
  });

  const writingStart = addMinutes(windDownStart, 30);
  schedule.push({
    name: "Writing Session",
    description: "Reflect and write - Express your thoughts",
    startTime: writingStart,
    endTime: ishaTime,
  });

  schedule.push({
    name: "Isha Prayer",
    description: "Night prayer - End your day with worship (30 min)",
    startTime: ishaTime,
    endTime: addMinutes(ishaTime, 30),
  });

  schedule.push({
    name: "Sleep",
    description: "Rest well - Prepare for tomorrow (8 hours)",
    startTime: addMinutes(ishaTime, 30),
    endTime: tahajjudStart,
  });

  // Find current activity
  for (let i = 0; i < schedule.length; i++) {
    const item = schedule[i];
    const nextItem = schedule[(i + 1) % schedule.length];

    if (now >= item.startTime && now < item.endTime) {
      return item;
    } else if (now >= item.endTime && now < nextItem.startTime) {
      return item;
    }
  }

  return schedule[schedule.length - 1]; // Default to sleep
}

async function sendTelegramMessage(message: string) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    console.error("Missing Telegram credentials");
    return false;
  }

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: "HTML",
        }),
      }
    );

    return response.ok;
  } catch (error) {
    console.error("Error sending Telegram message:", error);
    return false;
  }
}

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret to prevent unauthorized access
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const latitude = 37.37368;
    const longitude = -122.036568;

    // Fetch current prayer times
    const prayerTimes = await fetchPrayerTimes(latitude, longitude);
    if (!prayerTimes) {
      return NextResponse.json(
        { error: "Failed to fetch prayer times" },
        { status: 500 }
      );
    }

    // Calculate current activity
    const currentActivity = calculateCurrentActivity(prayerTimes);
    if (!currentActivity) {
      return NextResponse.json(
        { error: "Failed to calculate current activity" },
        { status: 500 }
      );
    }

    // Send notification
    const now = new Date();
    const message = `🕐 <b>${currentActivity.name}</b>\n${
      currentActivity.description
    }\n\n⏰ ${now.toLocaleTimeString()}`;

    const success = await sendTelegramMessage(message);

    return NextResponse.json({
      success,
      activity: currentActivity.name,
      time: now.toISOString(),
    });
  } catch (error) {
    console.error("Cron job error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
