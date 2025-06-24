// app/api/cron/route.ts

import { kv } from "@vercel/kv";
import { type NextRequest, NextResponse } from "next/server";
import { utcToZonedTime } from "date-fns-tz"; // <-- IMPORT THE MAGIC

// --- Interfaces ---
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

// --- TIMEZONE-AWARE HELPER FUNCTIONS ---
// This parseTime function now requires a timezone to work correctly on the server
const parseTime = (timeString: string, timezone: string): Date => {
  const [hours, minutes] = timeString.split(":").map(Number);
  // Create a date object that represents "today" in the user's timezone
  const zonedDate = utcToZonedTime(new Date(), timezone);
  zonedDate.setHours(hours, minutes, 0, 0);
  return zonedDate;
};
const addMinutes = (date: Date, minutes: number): Date =>
  new Date(date.getTime() + minutes * 60000);
const subtractMinutes = (date: Date, minutes: number): Date =>
  new Date(date.getTime() - minutes * 60000);

// The core scheduling logic, now timezone-aware
function calculateCurrentActivity(
  prayerTimes: PrayerTimes,
  timezone: string,
): ScheduleItem {
  const DURATION = {
    TAHAJJUD: 30,
    EAT_QURAN: 30,
    FAJR: 10,
    WORKOUT: 60,
    SHOWER: 5,
    LEETCODE: 120,
    BOOTDEV: 60,
    NAFL: 15,
    DHUHR: 15,
    ASR: 10,
    MAGHRIB: 10,
    EAT_DINNER: 30,
    WIND_DOWN: 30,
    WRITING: 30,
    ISHA: 30,
  };
  // This is the key: get the current time IN THE USER'S TIMEZONE
  const now = utcToZonedTime(new Date(), timezone);

  // All prayer times are now parsed relative to the user's timezone
  const fajrTime = parseTime(prayerTimes.Fajr, timezone),
    dhuhrTime = parseTime(prayerTimes.Dhuhr, timezone),
    asrTime = parseTime(prayerTimes.Asr, timezone),
    maghribTime = parseTime(prayerTimes.Maghrib, timezone),
    ishaTime = parseTime(prayerTimes.Isha, timezone);

  const ishaEnd = addMinutes(ishaTime, DURATION.ISHA);
  const tahajjudStartReference = subtractMinutes(fajrTime, 60);
  let nightSleepMillis = tahajjudStartReference.getTime() - ishaEnd.getTime();
  if (nightSleepMillis < 0) nightSleepMillis += 24 * 60 * 60 * 1000;
  const nightSleepMinutes = nightSleepMillis / 60000;
  const full8HoursSleep = nightSleepMinutes >= 480;

  const schedule: ScheduleItem[] = [];
  // The rest of your scheduling logic remains IDENTICAL, as it now operates on correct, zoned dates.
  const ishaStart = ishaTime,
    ishaEndTime = addMinutes(ishaStart, DURATION.ISHA),
    writingStart = subtractMinutes(ishaStart, DURATION.WRITING),
    windDownStart = subtractMinutes(writingStart, DURATION.WIND_DOWN),
    maghribStart = maghribTime,
    maghribEnd = addMinutes(maghribStart, DURATION.MAGHRIB),
    eatDinnerStart = maghribEnd,
    eatDinnerEnd = addMinutes(eatDinnerStart, DURATION.EAT_DINNER),
    asrStart = asrTime,
    asrEnd = addMinutes(asrStart, DURATION.ASR),
    dhuhrStart = dhuhrTime,
    dhuhrEnd = addMinutes(dhuhrStart, DURATION.DHUHR),
    fajrStart = fajrTime,
    fajrEnd = addMinutes(fajrStart, DURATION.FAJR);

  if (full8HoursSleep) {
    const sleepStart = ishaEndTime,
      wakeUpTime = addMinutes(sleepStart, 480);
    schedule.push({
      name: "Sleep",
      description: "Full 8 hours rest achieved",
      startTime: sleepStart,
      endTime: wakeUpTime,
    });
    let ptr = wakeUpTime;
    schedule.push({
      name: "Tahajjud",
      description: "Night prayer (30 min)",
      startTime: ptr,
      endTime: (ptr = addMinutes(ptr, DURATION.TAHAJJUD)),
    });
    schedule.push({
      name: "Eat while Quran",
      description: "Nourish body and soul (30 min)",
      startTime: ptr,
      endTime: (ptr = addMinutes(ptr, DURATION.EAT_QURAN)),
    });
    if ((fajrTime.getTime() - ptr.getTime()) / 60000 >= DURATION.WORKOUT) {
      schedule.push({
        name: "Work out",
        description: "Strengthen your body (1 hour)",
        startTime: ptr,
        endTime: (ptr = addMinutes(ptr, DURATION.WORKOUT)),
      });
      if ((fajrTime.getTime() - ptr.getTime()) / 60000 >= DURATION.SHOWER) {
        schedule.push({
          name: "Cold Shower",
          description: "Refresh and energize (5 min)",
          startTime: ptr,
          endTime: (ptr = addMinutes(ptr, DURATION.SHOWER)),
        });
        if ((fajrTime.getTime() - ptr.getTime()) / 60000 >= DURATION.BOOTDEV) {
          schedule.push({
            name: "Boot.dev Session",
            description: "Learn backend dev (1 hour)",
            startTime: ptr,
            endTime: (ptr = addMinutes(ptr, DURATION.BOOTDEV)),
          });
          if (
            (fajrTime.getTime() - ptr.getTime()) / 60000 >=
            DURATION.LEETCODE
          ) {
            schedule.push({
              name: "LeetCode Session",
              description: "Sharpen your skills (2 hours)",
              startTime: ptr,
              endTime: (ptr = addMinutes(ptr, DURATION.LEETCODE)),
            });
          }
        }
      }
    }
    if (ptr < fajrStart)
      schedule.push({
        name: "Personal Projects & Learning",
        description: "Build and create until Fajr",
        startTime: ptr,
        endTime: fajrStart,
      });
    schedule.push({
      name: "Fajr Prayer",
      description: "Dawn prayer (10 min)",
      startTime: fajrStart,
      endTime: fajrEnd,
    });
    schedule.push({
      name: "Personal Projects & Learning",
      description: "Build and create until Dhuhr",
      startTime: fajrEnd,
      endTime: dhuhrStart,
    });
    schedule.push({
      name: "Dhuhr Prayer",
      description: "Midday prayer (15 min)",
      startTime: dhuhrStart,
      endTime: dhuhrEnd,
    });
    const midPointDhuhrAsr = new Date(
      dhuhrEnd.getTime() + (asrStart.getTime() - dhuhrEnd.getTime()) / 2,
    );
    schedule.push({
      name: "Responsibilities",
      description: "Handle your duties",
      startTime: dhuhrEnd,
      endTime: midPointDhuhrAsr,
    });
    const naflEnd = addMinutes(midPointDhuhrAsr, DURATION.NAFL);
    schedule.push({
      name: "8 Raka'at Nafl",
      description: "Voluntary prayer (15 min)",
      startTime: midPointDhuhrAsr,
      endTime: naflEnd,
    });
    schedule.push({
      name: "Responsibilities",
      description: "Handle your duties",
      startTime: naflEnd,
      endTime: asrStart,
    });
  } else {
    const napMinutes = Math.max(0, 480 - nightSleepMinutes);
    schedule.push({
      name: "Sleep",
      description: `Rest until Tahajjud (${(nightSleepMinutes / 60).toFixed(1)} hours)`,
      startTime: ishaEndTime,
      endTime: tahajjudStartReference,
    });
    schedule.push({
      name: "Tahajjud",
      description: "Night prayer (30 min)",
      startTime: tahajjudStartReference,
      endTime: addMinutes(tahajjudStartReference, DURATION.TAHAJJUD),
    });
    schedule.push({
      name: "Eat while Quran",
      description: "Nourish body and soul (30 min)",
      startTime: addMinutes(tahajjudStartReference, DURATION.TAHAJJUD),
      endTime: fajrStart,
    });
    schedule.push({
      name: "Fajr Prayer",
      description: "Dawn prayer (10 min)",
      startTime: fajrStart,
      endTime: fajrEnd,
    });
    const workoutEnd = addMinutes(fajrEnd, DURATION.WORKOUT),
      showerEnd = addMinutes(workoutEnd, DURATION.SHOWER),
      leetcodeEnd = addMinutes(showerEnd, DURATION.LEETCODE),
      bootdevEnd = addMinutes(leetcodeEnd, DURATION.BOOTDEV),
      nafl1End = addMinutes(bootdevEnd, DURATION.NAFL);
    schedule.push({
      name: "Work out",
      description: "Strengthen your body (1 hour)",
      startTime: fajrEnd,
      endTime: workoutEnd,
    });
    schedule.push({
      name: "Cold Shower",
      description: "Refresh and energize (5 min)",
      startTime: workoutEnd,
      endTime: showerEnd,
    });
    schedule.push({
      name: "LeetCode Session",
      description: "Sharpen your skills (2 hours)",
      startTime: showerEnd,
      endTime: leetcodeEnd,
    });
    schedule.push({
      name: "Boot.dev Session",
      description: "Learn backend dev (1 hour)",
      startTime: leetcodeEnd,
      endTime: bootdevEnd,
    });
    schedule.push({
      name: "8 Raka'at Nafl",
      description: "Voluntary prayer (15 min)",
      startTime: bootdevEnd,
      endTime: nafl1End,
    });
    schedule.push({
      name: "Personal Projects & Learning",
      description: "Build and create until Dhuhr",
      startTime: nafl1End,
      endTime: dhuhrStart,
    });
    schedule.push({
      name: "Dhuhr Prayer",
      description: "Midday prayer (15 min)",
      startTime: dhuhrStart,
      endTime: dhuhrEnd,
    });
    const napEnd = addMinutes(dhuhrEnd, napMinutes);
    schedule.push({
      name: "Nap",
      description: `Rest to complete 8h sleep (${(napMinutes / 60).toFixed(1)}h)`,
      startTime: dhuhrEnd,
      endTime: napEnd,
    });
    const nafl2End = addMinutes(napEnd, DURATION.NAFL);
    schedule.push({
      name: "8 Raka'at Nafl",
      description: "Voluntary prayer (15 min)",
      startTime: napEnd,
      endTime: nafl2End,
    });
    schedule.push({
      name: "Responsibilities",
      description: "Handle your duties until Asr",
      startTime: nafl2End,
      endTime: asrStart,
    });
  }
  schedule.push({
    name: "Asr Prayer",
    description: "Afternoon prayer (10 min)",
    startTime: asrStart,
    endTime: asrEnd,
  });
  schedule.push({
    name: "Responsibilities",
    description: "Handle duties until Maghrib",
    startTime: asrEnd,
    endTime: maghribStart,
  });
  schedule.push({
    name: "Maghrib Prayer",
    description: "Sunset prayer (10 min)",
    startTime: maghribStart,
    endTime: maghribEnd,
  });
  schedule.push({
    name: "Eat",
    description: "Evening meal (30 min)",
    startTime: eatDinnerStart,
    endTime: eatDinnerEnd,
  });
  schedule.push({
    name: "Responsibilities",
    description: "Handle duties until wind-down",
    startTime: eatDinnerEnd,
    endTime: windDownStart,
  });
  schedule.push({
    name: "Wind down",
    description: "Relax and prepare for sleep (30 min)",
    startTime: windDownStart,
    endTime: writingStart,
  });
  schedule.push({
    name: "Writing",
    description: "Journal or creative writing (30 min)",
    startTime: writingStart,
    endTime: ishaStart,
  });
  schedule.push({
    name: "Isha Prayer",
    description: "Night prayer (30 min)",
    startTime: ishaStart,
    endTime: ishaEndTime,
  });

  const sortedSchedule = schedule.sort(
    (a, b) => a.startTime.getTime() - b.startTime.getTime(),
  );
  const nextIdx = sortedSchedule.findIndex((item) => item.startTime > now);
  const currIdx =
    nextIdx === -1 || nextIdx === 0 ? sortedSchedule.length - 1 : nextIdx - 1;
  return sortedSchedule[currIdx];
}

// --- Main Cron Job Handler ---
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userKey = "user_settings";
  const userSettings = await kv.get<{
    latitude: number;
    longitude: number;
    timezone: string; // <-- We will now get the timezone
    lastNotifiedActivity: string;
  }>(userKey);

  if (!userSettings?.latitude || !userSettings?.timezone) {
    // Check for timezone too
    return NextResponse.json({
      message: "User location/timezone not set up. Skipping.",
    });
  }

  const today = new Date();
  const url = `https://api.aladhan.com/v1/timings/${today.getDate()}-${today.getMonth() + 1}-${today.getFullYear()}?latitude=${userSettings.latitude}&longitude=${userSettings.longitude}&method=2`;
  const response = await fetch(url);
  if (!response.ok) {
    return NextResponse.json(
      { error: "Failed to fetch prayer times" },
      { status: 500 },
    );
  }
  const data = await response.json();
  const prayerTimes = data.data?.timings;
  if (!prayerTimes) {
    return NextResponse.json(
      { error: "Invalid prayer times data" },
      { status: 500 },
    );
  }

  // Pass the user's timezone to the calculation function
  const currentActivity = calculateCurrentActivity(
    prayerTimes,
    userSettings.timezone,
  );

  if (currentActivity.name !== userSettings.lastNotifiedActivity) {
    const message = `🕐 <b>${currentActivity.name}</b>\n${currentActivity.description}`;

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "HTML",
      }),
    });

    await kv.set(userKey, {
      ...userSettings,
      lastNotifiedActivity: currentActivity.name,
    });

    return NextResponse.json({
      status: "notified",
      new_activity: currentActivity.name,
    });
  } else {
    return NextResponse.json({
      status: "no-change",
      activity: currentActivity.name,
    });
  }
}
