// src/lib/schedule-logic.ts

import { toZonedTime } from "date-fns-tz";
import { PrayerTimes, ScheduleItem, MealMode } from "./types";

// =================================================================
//  DATE & TIME HELPERS
// =================================================================

export const addMinutes = (date: Date, minutes: number): Date => new Date(date.getTime() + minutes * 60000);
export const subtractMinutes = (date: Date, minutes: number): Date => new Date(date.getTime() - minutes * 60000);

export const parseTime = (timeString: string, timezone: string): Date => {
  const [hours, minutes] = timeString.split(":").map(Number);
  const zonedDate = toZonedTime(new Date(), timezone);
  zonedDate.setHours(hours, minutes, 0, 0);
  return zonedDate;
};

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
  const shower = { name: "Optional Cold Shower", duration: WORKOUT_DURATIONS.COLD_SHOWER };

  const workouts: Record<number, { name: string; components: any[] }> = {
    1: { name: "Push Day", components: [{ name: "Bench Press (4x6), Dips (3x12), Incline DB (3x8)", duration: WORKOUT_DURATIONS.BARBELL }, ...calisthenics, running, shower] },
    2: { name: "Muay Thai Conditioning", components: [{ name: "Shadowboxing, Heavy Bag, Core", duration: WORKOUT_DURATIONS.MUAY_THAI }, running, shower] },
    3: { name: "Leg Day", components: [{ name: "Barbell Squats (4x8), RDL (3x10), Lunges (3x20)", duration: WORKOUT_DURATIONS.BARBELL }, ...calisthenics, running, shower] },
    4: { name: "Active Recovery", components: [{ name: "Light Run & Mobility", duration: WORKOUT_DURATIONS.ACTIVE_RECOVERY }, shower] },
    5: { name: "Pull Day", components: [{ name: "Deadlift (4x5), Rows (3x10), Chin-ups (3xAMRAP)", duration: WORKOUT_DURATIONS.BARBELL }, ...calisthenics, running, shower] },
    6: { name: "Muay Thai & Core", components: [{ name: "Bag Work, Partner Drills, Core Circuit", duration: WORKOUT_DURATIONS.MUAY_THAI }, shower] },
    0: { name: "Shoulder Day", components: [{ name: "Overhead Press (4x8), Lateral Raises (3x12), Rear Delts (3x15)", duration: WORKOUT_DURATIONS.BARBELL }, ...calisthenics, running, shower] },
  };
  return workouts[day] || { name: "Calisthenics & Cardio", components: [...calisthenics, running, shower] };
}

function getMealPlan(day: number, mode: MealMode): { meal1: string; meal2: string; meal3: string } {
  const p = {
    bulking: { meat: "8oz", fat: "2 tbsp", carbs: "1 cup" },
    maintenance: { meat: "6oz", fat: "1.5 tbsp", carbs: "0.75 cup" },
    cutting: { meat: "4-6oz", fat: "1 tbsp", carbs: "0.5 cup (or none at dinner)" },
  }[mode];

  const weeklyMenu = [
    { meal1: `Protein pancakes (egg, whey, oats), berries, 2 Brazil nuts`, meal2: `Slow-cooked beef stew with carrots & potatoes (${p.carbs})`, meal3: `${p.meat} grilled chicken breast with full-fat Greek yogurt & honey` },
    { meal1: `4 scrambled eggs (beef tallow), avocado, raw milk`, meal2: `${p.meat} grass-fed steak, 1 sweet potato with ghee, side of sauerkraut`, meal3: `6oz wild-caught salmon, quinoa (${p.carbs}), large spinach salad (${p.fat} olive oil)` },
    { meal1: `Greek yogurt, whey, berries, almonds`, meal2: `${p.meat} halal ground beef, white rice (${p.carbs}, beef tallow), pickled cucumber`, meal3: `Cottage cheese, fruit, honey, glass of kefir` },
    { meal1: `4 eggs in ghee, onions, peppers, sourdough`, meal2: `${p.meat} chicken thighs, basmati rice (${p.carbs}), steamed broccoli`, meal3: `6oz cod, roasted asparagus, lentils` },
    { meal1: `Smoothie: whey, spinach, banana, almond butter, milk`, meal2: `Protein oats (milk, whey, walnuts)`, meal3: `Large bowl chicken & vegetable soup` },
    { meal1: `Beef sausage, 3 fried eggs, fermented pickles, 1oz beef liver (optional)`, meal2: `3 lamb chops, couscous (${p.carbs}), grilled zucchini`, meal3: `Quinoa bowl with shredded chicken, chickpeas, tahini (${p.fat})` },
    { meal1: `${p.meat} sirloin steak & 2 eggs`, meal2: `${p.meat} ground turkey, black beans, avocado, corn salsa`, meal3: `8oz baked salmon, roasted potatoes, green beans` },
  ];
  return weeklyMenu[day] || weeklyMenu[4];
}

function getTahajjud(availableMinutes: number): { name: string; duration: number } | null {
  if (availableMinutes >= 30) return { name: "Tahajjud (12 Rakaat)", duration: 30 };
  if (availableMinutes >= 20) return { name: "Tahajjud (8 Rakaat)", duration: 20 };
  if (availableMinutes >= 10) return { name: "Tahajjud (4 Rakaat)", duration: 10 };
  if (availableMinutes >= 5) return { name: "Tahajjud (2 Rakaat)", duration: 5 };
  return null;
}

// =================================================================
//  SCHEDULE CALCULATION
// =================================================================

export function calculateSchedule(
  prayerTimes: PrayerTimes,
  timezone: string,
  mode: MealMode,
): { schedule: ScheduleItem[], current: ScheduleItem; next: ScheduleItem } {
  const now = toZonedTime(new Date(), timezone);
  const dayOfWeek = now.getDay();
  const meals = getMealPlan(dayOfWeek, mode);

  const PRAYER_DURATIONS = { FAJR: 10, DHUHR: 15, ASR: 10, MAGHRIB: 10, ISHA: 30 };
  const MEAL_DURATION = 30;
  const TARGET_SLEEP_HOURS = 9;

  const prayerDateTimes = {
    fajr: parseTime(prayerTimes.Fajr, timezone),
    sunrise: parseTime(prayerTimes.Sunrise, timezone),
    dhuhr: parseTime(prayerTimes.Dhuhr, timezone),
    asr: parseTime(prayerTimes.Asr, timezone),
    maghrib: parseTime(prayerTimes.Maghrib, timezone),
    isha: parseTime(prayerTimes.Isha, timezone),
  };

  const buildTimeline = (): ScheduleItem[] => {
    const timeline: ScheduleItem[] = [];
    let currentTime = subtractMinutes(prayerDateTimes.fajr, 120); // Start 2 hours before Fajr

    // Pre-Fajr Activities
    const minutesToFajr = (prayerDateTimes.fajr.getTime() - currentTime.getTime()) / 60000;
    const tahajjud = getTahajjud(minutesToFajr);
    if (tahajjud) {
      timeline.push({ name: tahajjud.name, description: "Night prayer", startTime: currentTime, endTime: addMinutes(currentTime, tahajjud.duration) });
      currentTime = addMinutes(currentTime, tahajjud.duration);
    }
    const quranBeforeFajrDuration = (prayerDateTimes.fajr.getTime() - currentTime.getTime()) / 60000 - 5;
    if (quranBeforeFajrDuration > 0) {
      timeline.push({ name: "Quran Recitation", description: "Read and reflect upon the Quran.", startTime: currentTime, endTime: addMinutes(currentTime, quranBeforeFajrDuration) });
      currentTime = addMinutes(currentTime, quranBeforeFajrDuration);
    }
    timeline.push({ name: "Prepare for Fajr", description: "Wudu & walk to Masjid", startTime: currentTime, endTime: prayerDateTimes.fajr });

    // Fajr to Dhuhr
    timeline.push({ name: "Fajr Prayer", description: "Congregational prayer.", startTime: prayerDateTimes.fajr, endTime: addMinutes(prayerDateTimes.fajr, PRAYER_DURATIONS.FAJR) });
    timeline.push({ name: "Post-Fajr Azkar", description: "Morning remembrances.", startTime: addMinutes(prayerDateTimes.fajr, PRAYER_DURATIONS.FAJR), endTime: prayerDateTimes.sunrise });
    const morningWorkout = getWorkoutForDay(dayOfWeek);
    let workoutTime = prayerDateTimes.sunrise;
    morningWorkout.components.forEach(w => {
      timeline.push({ name: w.name, description: morningWorkout.name, startTime: workoutTime, endTime: addMinutes(workoutTime, w.duration) });
      workoutTime = addMinutes(workoutTime, w.duration);
    });
    timeline.push({ name: "Breakfast", description: meals.meal1, startTime: workoutTime, endTime: addMinutes(workoutTime, MEAL_DURATION) });
    timeline.push({ name: "Deep Work Block 1", description: "Tackle the most important task of the day.", startTime: addMinutes(workoutTime, MEAL_DURATION), endTime: prayerDateTimes.dhuhr });

    // Dhuhr to Asr
    timeline.push({ name: "Dhuhr Prayer", description: "Congregational prayer.", startTime: prayerDateTimes.dhuhr, endTime: addMinutes(prayerDateTimes.dhuhr, PRAYER_DURATIONS.DHUHR) });
    timeline.push({ name: "Lunch", description: meals.meal2, startTime: addMinutes(prayerDateTimes.dhuhr, PRAYER_DURATIONS.DHUHR), endTime: addMinutes(prayerDateTimes.dhuhr, PRAYER_DURATIONS.DHUHR + MEAL_DURATION) });
    timeline.push({ name: "Deep Work Block 2", description: "Continue with focused work.", startTime: addMinutes(prayerDateTimes.dhuhr, PRAYER_DURATIONS.DHUHR + MEAL_DURATION), endTime: prayerDateTimes.asr });

    // Asr to Maghrib
    timeline.push({ name: "Asr Prayer", description: "Congregational prayer.", startTime: prayerDateTimes.asr, endTime: addMinutes(prayerDateTimes.asr, PRAYER_DURATIONS.ASR) });
    timeline.push({ name: "Shallow Work", description: "Emails, admin tasks, planning.", startTime: addMinutes(prayerDateTimes.asr, PRAYER_DURATIONS.ASR), endTime: prayerDateTimes.maghrib });

    // Maghrib to Isha
    timeline.push({ name: "Maghrib Prayer", description: "Congregational prayer.", startTime: prayerDateTimes.maghrib, endTime: addMinutes(prayerDateTimes.maghrib, PRAYER_DURATIONS.MAGHRIB) });
    timeline.push({ name: "Dinner", description: meals.meal3, startTime: addMinutes(prayerDateTimes.maghrib, PRAYER_DURATIONS.MAGHRIB), endTime: addMinutes(prayerDateTimes.maghrib, PRAYER_DURATIONS.MAGHRIB + MEAL_DURATION) });
    timeline.push({ name: "Family/Leisure Time", description: "Connect with loved ones or relax.", startTime: addMinutes(prayerDateTimes.maghrib, PRAYER_DURATIONS.MAGHRIB + MEAL_DURATION), endTime: prayerDateTimes.isha });
    
    // Isha to Sleep
    timeline.push({ name: "Isha Prayer", description: "Congregational prayer.", startTime: prayerDateTimes.isha, endTime: addMinutes(prayerDateTimes.isha, PRAYER_DURATIONS.ISHA) });
    let postIshaTime = addMinutes(prayerDateTimes.isha, PRAYER_DURATIONS.ISHA);
    timeline.push({ name: "Prepare for Tomorrow", description: "Plan tasks, pack bag.", startTime: postIshaTime, endTime: addMinutes(postIshaTime, 15) });
    postIshaTime = addMinutes(postIshaTime, 15);
    timeline.push({ name: "Quran & Reflection", description: "Evening Quran reading.", startTime: postIshaTime, endTime: addMinutes(postIshaTime, 15) });
    postIshaTime = addMinutes(postIshaTime, 15);
    const sleepTime = addMinutes(prayerDateTimes.fajr, (24 - TARGET_SLEEP_HOURS) * 60);
    timeline.push({ name: "Wind Down", description: "No screens, light reading.", startTime: postIshaTime, endTime: sleepTime });
    timeline.push({ name: "Sleep", description: `Targeting ${TARGET_SLEEP_HOURS} hours of sleep.`, startTime: sleepTime, endTime: prayerDateTimes.fajr }); // Ends at next Fajr

    return timeline.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  };

  const schedule = buildTimeline();

  let currentIndex = schedule.findIndex(item => now >= item.startTime && now < item.endTime);
  if (currentIndex === -1) {
    // Handle transitions between activities
    const nextActivityIndex = schedule.findIndex(item => item.startTime > now);
    if (nextActivityIndex > 0) {
      const prevActivity = schedule[nextActivityIndex - 1];
      return {
        schedule,
        current: { name: "Transition", description: `Preparing for ${schedule[nextActivityIndex].name}`, startTime: prevActivity.endTime, endTime: schedule[nextActivityIndex].startTime },
        next: schedule[nextActivityIndex],
      };
    }
    // Default to a safe state if something goes wrong
    const fallbackActivity = { name: "Idle", description: "Waiting for next activity.", startTime: now, endTime: now };
    return { schedule, current: fallbackActivity, next: schedule[0] || fallbackActivity };
  }

  const current = schedule[currentIndex];
  const next = schedule[(currentIndex + 1) % schedule.length];
  
  return { schedule, current, next };
}
