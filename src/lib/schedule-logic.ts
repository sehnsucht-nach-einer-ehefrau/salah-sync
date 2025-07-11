// src/lib/schedule-logic.ts

import { toZonedTime } from "date-fns-tz";

// =================================================================
//  INTERFACES & TYPES
// =================================================================

export interface PrayerTimes {
  Fajr: string;
  Dhuhr: string;
  Asr: string;
  Maghrib: string;
  Isha: string;
  Sunrise: string;
}
export interface ScheduleItem {
  name: string;
  description: string;
  startTime: Date;
  endTime: Date;
}
export type MealMode = "bulking" | "maintenance" | "cutting";
export type AppMode = "strict" | "downtime";

export interface DowntimeState {
  lastNotifiedActivity: string;
  currentActivity: string;
  activityStartTime: string | null;
  lastGripTime: string | null;
  gripStrengthEnabled: boolean;
  quranTurn: boolean;
  // New properties for pause-and-resume functionality
  timeRemainingOnPause: number | null; // in milliseconds
  activityBeforePause: string | null;
}

export interface UserSettings {
  latitude: number;
  longitude: number;
  timezone: string;
  city?: string; // <<< FIX: Added city property to match saved data
  mode: AppMode;
  mealMode: MealMode;
  lastNotifiedActivity: string; // For strict mode
  downtime: DowntimeState;
}

// =================================================================
//  DATE & TIME HELPERS
// =================================================================

export const addMinutes = (date: Date, minutes: number): Date =>
  new Date(date.getTime() + minutes * 60000);
export const subtractMinutes = (date: Date, minutes: number): Date =>
  new Date(date.getTime() - minutes * 60000);

// =================================================================
//  MEAL & WORKOUT DATA
// =================================================================

const WORKOUT_DURATIONS = {
  PUSH_UPS: 10,
  SIT_UPS: 10,
  PULL_UPS: 10,
  RUN: 30,
  BARBELL: 45,
  MUAY_THAI: 60,
  ACTIVE_RECOVERY: 45,
  COLD_SHOWER: 5,
};
interface DailyWorkout {
  name: string;
  components: { name: string; duration: number }[];
}

function getWorkoutForDay(day: number): DailyWorkout {
  const calisthenics = [
    { name: "Max Rep Push-ups", duration: WORKOUT_DURATIONS.PUSH_UPS },
    { name: "Max Rep Sit-ups", duration: WORKOUT_DURATIONS.SIT_UPS },
    { name: "Max Rep Pull-ups", duration: WORKOUT_DURATIONS.PULL_UPS },
  ];
  const running = { name: "Running", duration: WORKOUT_DURATIONS.RUN };
  const shower = {
    name: "Optional Cold Shower",
    duration: WORKOUT_DURATIONS.COLD_SHOWER,
  };

  switch (day) {
    case 1:
      return {
        name: "Push Day",
        components: [
          {
            name: "Bench Press (4x6), Dips (3x12), Incline DB (3x8)",
            duration: WORKOUT_DURATIONS.BARBELL,
          },
          ...calisthenics,
          running,
          shower,
        ],
      };
    case 2:
      return {
        name: "Muay Thai Conditioning",
        components: [
          {
            name: "Shadowboxing, Heavy Bag, Core",
            duration: WORKOUT_DURATIONS.MUAY_THAI,
          },
          running,
          shower,
        ],
      };
    case 3:
      return {
        name: "Leg Day",
        components: [
          {
            name: "Barbell Squats (4x8), RDL (3x10), Lunges (3x20)",
            duration: WORKOUT_DURATIONS.BARBELL,
          },
          ...calisthenics,
          running,
          shower,
        ],
      };
    case 4:
      return {
        name: "Active Recovery",
        components: [
          {
            name: "Light Run & Mobility",
            duration: WORKOUT_DURATIONS.ACTIVE_RECOVERY,
          },
          shower,
        ],
      };
    case 5:
      return {
        name: "Pull Day",
        components: [
          {
            name: "Deadlift (4x5), Rows (3x10), Chin-ups (3xAMRAP)",
            duration: WORKOUT_DURATIONS.BARBELL,
          },
          ...calisthenics,
          running,
          shower,
        ],
      };
    case 6:
      return {
        name: "Muay Thai & Core",
        components: [
          {
            name: "Bag Work, Partner Drills, Core Circuit",
            duration: WORKOUT_DURATIONS.MUAY_THAI,
          },
          shower,
        ],
      };
    case 0:
      return {
        name: "Shoulder Day",
        components: [
          {
            name: "Overhead Press (4x8), Lateral Raises (3x12), Rear Delts (3x15)",
            duration: WORKOUT_DURATIONS.BARBELL,
          },
          ...calisthenics,
          running,
          shower,
        ],
      };
    default:
      return {
        name: "Calisthenics & Cardio",
        components: [...calisthenics, running, shower],
      };
  }
}

function getMealPlan(
  day: number,
  mode: MealMode,
): { meal1: string; meal2: string; meal3: string } {
  const basePortions = {
    bulking: { meat: "8oz", fat: "2 tbsp", carbs: "1 cup" },
    maintenance: { meat: "6oz", fat: "1.5 tbsp", carbs: "0.75 cup" },
    cutting: {
      meat: "4-6oz",
      fat: "1 tbsp",
      carbs: "0.5 cup (or none at dinner)",
    },
  };
  const p = basePortions[mode];

  const weeklyMenu = [
    // 0: Sunday (Shoulder Day)
    {
      meal1: `Protein pancakes (egg, whey, oats), berries, 2 Brazil nuts`,
      meal2: `Slow-cooked beef stew with carrots & potatoes (${p.carbs})`,
      meal3: `${p.meat} grilled chicken breast with full-fat Greek yogurt & honey`,
    },
    // 1: Monday (Push Day)
    {
      meal1: `4 scrambled eggs (beef tallow), avocado, raw milk`,
      meal2: `${p.meat} grass-fed steak, 1 sweet potato with ghee, side of sauerkraut`,
      meal3: `6oz wild-caught salmon, quinoa (${p.carbs}), large spinach salad (${p.fat} olive oil)`,
    },
    // 2: Tuesday (Muay Thai)
    {
      meal1: `Greek yogurt, whey, berries, almonds`,
      meal2: `${p.meat} halal ground beef, white rice (${p.carbs}, beef tallow), pickled cucumber`,
      meal3: `Cottage cheese, fruit, honey, glass of kefir`,
    },
    // 3: Wednesday (Leg Day)
    {
      meal1: `4 eggs in ghee, onions, peppers, sourdough`,
      meal2: `${p.meat} chicken thighs, basmati rice (${p.carbs}), steamed broccoli`,
      meal3: `6oz cod, roasted asparagus, lentils`,
    },
    // 4: Thursday (Active Recovery)
    {
      meal1: `Smoothie: whey, spinach, banana, almond butter, milk`,
      meal2: `Protein oats (milk, whey, walnuts)`,
      meal3: `Large bowl chicken & vegetable soup`,
    },
    // 5: Friday (Pull Day)
    {
      meal1: `Beef sausage, 3 fried eggs, fermented pickles, 1oz beef liver (optional)`,
      meal2: `3 lamb chops, couscous (${p.carbs}), grilled zucchini`,
      meal3: `Quinoa bowl with shredded chicken, chickpeas, tahini (${p.fat})`,
    },
    // 6: Saturday (Muay Thai)
    {
      meal1: `${p.meat} sirloin steak & 2 eggs`,
      meal2: `${p.meat} ground turkey, black beans, avocado, corn salsa`,
      meal3: `8oz baked salmon, roasted potatoes, green beans`,
    },
  ];
  return weeklyMenu[day];
}

function getTahajjud(
  availableMinutes: number,
): { name: string; duration: number } | null {
  if (availableMinutes >= 30)
    return { name: "Tahajjud (12 Rakaat)", duration: 30 };
  if (availableMinutes >= 20)
    return { name: "Tahajjud (8 Rakaat)", duration: 20 };
  if (availableMinutes >= 10)
    return { name: "Tahajjud (4 Rakaat)", duration: 10 };
  if (availableMinutes >= 5)
    return { name: "Tahajjud (2 Rakaat)", duration: 5 };
  return null;
}

export const parseTime = (timeString: string, timezone: string): Date => {
  const [hours, minutes] = timeString.split(":").map(Number);
  const zonedDate = toZonedTime(new Date(), timezone);
  zonedDate.setHours(hours, minutes, 0, 0);
  return zonedDate;
};

export function calculateSchedule(
  prayerTimes: PrayerTimes,
  timezone: string,
  mode: MealMode,
): { current: ScheduleItem; next: ScheduleItem } {
  const now = toZonedTime(new Date(), timezone);
  const dayOfWeek = now.getDay();

  const PRAYER_DURATIONS = {
    FAJR: 10,
    DHUHR: 15,
    ASR: 10,
    MAGHRIB: 10,
    ISHA: 30,
  };
  const MEAL_DURATION = 30,
    TARGET_SLEEP_HOURS = 9;

  const fajrTime = parseTime(prayerTimes.Fajr, timezone),
    dhuhrTime = parseTime(prayerTimes.Dhuhr, timezone),
    asrTime = parseTime(prayerTimes.Asr, timezone),
    maghribTime = parseTime(prayerTimes.Maghrib, timezone),
    ishaTime = parseTime(prayerTimes.Isha, timezone),
    sunriseTime = parseTime(prayerTimes.Sunrise, timezone);
  const fajrCutoff = subtractMinutes(sunriseTime, 10);

  const ishaEndTime = addMinutes(ishaTime, PRAYER_DURATIONS.ISHA);
  const sleepWindowEnd = fajrCutoff;

  const nineHourWakeup = addMinutes(ishaEndTime, TARGET_SLEEP_HOURS * 60);
  const actualWakeUpTime =
    nineHourWakeup < sleepWindowEnd ? nineHourWakeup : sleepWindowEnd;

  let nightSleepMillis = actualWakeUpTime.getTime() - ishaEndTime.getTime();
  if (nightSleepMillis < 0) nightSleepMillis += 24 * 60 * 60 * 1000;
  const nightSleepMinutes = nightSleepMillis / 60000;

  const sleepDeficitMinutes = Math.max(
    0,
    TARGET_SLEEP_HOURS * 60 - nightSleepMinutes,
  );
  const needsNap = sleepDeficitMinutes > 15;

  const timeBeforeFajr =
    (fajrTime.getTime() - actualWakeUpTime.getTime()) / 60000;
  const tahajjud = getTahajjud(timeBeforeFajr);

  const dailyWorkout = getWorkoutForDay(dayOfWeek);
  const meals = getMealPlan(dayOfWeek, mode);

  const schedule: ScheduleItem[] = [];
  let ptr = actualWakeUpTime;

  if (tahajjud) {
    schedule.push({
      name: tahajjud.name,
      description: "Night prayer for spiritual connection.",
      startTime: ptr,
      endTime: (ptr = addMinutes(ptr, tahajjud.duration)),
    });
  }

  const timeForPreFajrWork = (fajrTime.getTime() - ptr.getTime()) / 60000;
  if (timeForPreFajrWork > 15) {
    schedule.push({
      name: "Quran Study / Deep Work",
      description: "Focused pre-dawn session.",
      startTime: ptr,
      endTime: fajrTime,
    });
  }

  schedule.push({
    name: "Fajr Prayer",
    description: "Dawn prayer before sunrise.",
    startTime: fajrTime,
    endTime: (ptr = addMinutes(fajrTime, PRAYER_DURATIONS.FAJR)),
  });

  for (const component of dailyWorkout.components) {
    schedule.push({
      name: component.name,
      description: dailyWorkout.name,
      startTime: ptr,
      endTime: (ptr = addMinutes(ptr, component.duration)),
    });
  }

  schedule.push({
    name: "Meal 1 (Sunlight & Quran)",
    description: meals.meal1,
    startTime: ptr,
    endTime: (ptr = addMinutes(ptr, MEAL_DURATION)),
  });
  schedule.push({
    name: "Deep Work Block 1",
    description: "First focused work session of the day.",
    startTime: ptr,
    endTime: subtractMinutes(dhuhrTime, 30),
  });
  schedule.push({
    name: "Nafl (Duha Prayer)",
    description: "Mid-morning voluntary prayer.",
    startTime: subtractMinutes(dhuhrTime, 30),
    endTime: dhuhrTime,
  });

  schedule.push({
    name: "Dhuhr Prayer",
    description: "Midday prayer.",
    startTime: dhuhrTime,
    endTime: (ptr = addMinutes(dhuhrTime, PRAYER_DURATIONS.DHUHR)),
  });

  if (needsNap) {
    schedule.push({
      name: "Qailulah Nap",
      description: `Recharging for ${sleepDeficitMinutes.toFixed(0)} minutes.`,
      startTime: ptr,
      endTime: (ptr = addMinutes(ptr, sleepDeficitMinutes)),
    });
  }

  schedule.push({
    name: "Meal 2 (Anabolic)",
    description: meals.meal2,
    startTime: ptr,
    endTime: (ptr = addMinutes(ptr, MEAL_DURATION)),
  });
  schedule.push({
    name: "Post-lunch Nafl",
    description: "Optional voluntary prayer.",
    startTime: ptr,
    endTime: (ptr = addMinutes(ptr, 10)),
  });
  schedule.push({
    name: "Deep Work Block 2",
    description: "Post-nap focused session.",
    startTime: ptr,
    endTime: asrTime,
  });

  schedule.push({
    name: "Asr Prayer",
    description: "Afternoon prayer.",
    startTime: asrTime,
    endTime: (ptr = addMinutes(asrTime, PRAYER_DURATIONS.ASR)),
  });
  schedule.push({
    name: "Deep Work Block 3",
    description: "Final work session before sunset.",
    startTime: ptr,
    endTime: maghribTime,
  });

  schedule.push({
    name: "Maghrib Prayer",
    description: "Sunset prayer.",
    startTime: maghribTime,
    endTime: (ptr = addMinutes(maghribTime, PRAYER_DURATIONS.MAGHRIB)),
  });
  schedule.push({
    name: "Meal 3 (Dinner)",
    description: meals.meal3,
    startTime: ptr,
    endTime: (ptr = addMinutes(ptr, MEAL_DURATION)),
  });
  schedule.push({
    name: "Final Deep Work / Reflection",
    description: "Journaling, planning, light reading.",
    startTime: ptr,
    endTime: subtractMinutes(ishaTime, 60),
  });
  schedule.push({
    name: "Cooldown Hour (No Screens)",
    description: "Dim lights, mobility, prepare for sleep.",
    startTime: subtractMinutes(ishaTime, 60),
    endTime: ishaTime,
  });

  schedule.push({
    name: "Isha Prayer",
    description: "Night prayer.",
    startTime: ishaTime,
    endTime: ishaEndTime,
  });
  schedule.push({
    name: "Sleep",
    description: `Target: ${TARGET_SLEEP_HOURS} hours of restorative sleep.`,
    startTime: ishaEndTime,
    endTime: actualWakeUpTime,
  });

  const sortedSchedule = schedule
    .filter((item) => item.startTime < item.endTime)
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  let currentItem = sortedSchedule.find(
    (item) => now >= item.startTime && now < item.endTime,
  );
  if (!currentItem) {
    for (let i = 0; i < sortedSchedule.length; i++) {
      const item = sortedSchedule[i];
      const nextItemInLoop = sortedSchedule[(i + 1) % sortedSchedule.length];
      if (now >= item.endTime && now < nextItemInLoop.startTime) {
        currentItem = {
          name: "Transition",
          description: `Preparing for ${nextItemInLoop.name}.`,
          startTime: item.endTime,
          endTime: nextItemInLoop.startTime,
        };
        break;
      }
    }
    if (!currentItem)
      currentItem =
        sortedSchedule.find((s) => s.name === "Sleep") || sortedSchedule[0];
  }

  const nextItemIndex = sortedSchedule.findIndex(
    (item) => item.startTime > now,
  );
  const nextItem = sortedSchedule[nextItemIndex === -1 ? 0 : nextItemIndex];

  return { current: currentItem!, next: nextItem! };
}
