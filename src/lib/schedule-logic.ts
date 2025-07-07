// src/lib/schedule-logic.ts

import { toZonedTime } from "date-fns-tz";

// =================================================================
//  INTERFACES
// =================================================================

export interface PrayerTimes {
  Fajr: string;
  Dhuhr: string;
  Asr: string;
  Maghrib: string;
  Isha: string;
}
export interface ScheduleItem {
  name: string;
  description: string;
  startTime: Date;
  endTime: Date;
}

// =================================================================
//  DATE & TIME HELPERS
// =================================================================

export const parseTime = (timeString: string, timezone: string): Date => {
  const [hours, minutes] = timeString.split(":").map(Number);
  const zonedDate = toZonedTime(new Date(), timezone);
  zonedDate.setHours(hours, minutes, 0, 0);
  return zonedDate;
};
export const addMinutes = (date: Date, minutes: number): Date =>
  new Date(date.getTime() + minutes * 60000);
export const subtractMinutes = (date: Date, minutes: number): Date =>
  new Date(date.getTime() - minutes * 60000);

// =================================================================
//  Meal and Workout Data Helpers
// =================================================================

const WORKOUT_DURATIONS = {
  PUSH_UPS: 10,
  SIT_UPS: 10,
  PULL_UPS: 10,
  RUN: 30,
  BARBELL: 45,
  COLD_SHOWER: 5,
};
// Add a description property to workout tasks as well, to satisfy the type.
interface DailyWorkout {
  name: string;
  components: { name: string; description: string; duration: number }[];
}

function getWorkoutForDay(day: number): DailyWorkout {
  const calisthenics = [
    {
      name: "Push-ups",
      description: "Max reps push-ups.",
      duration: WORKOUT_DURATIONS.PUSH_UPS,
    },
    {
      name: "Sit-ups",
      description: "Core conditioning.",
      duration: WORKOUT_DURATIONS.SIT_UPS,
    },
    {
      name: "Pull-ups",
      description: "Max reps pull-ups.",
      duration: WORKOUT_DURATIONS.PULL_UPS,
    },
  ];
  const running = {
    name: "Running",
    description: "30-minute cardio session.",
    duration: WORKOUT_DURATIONS.RUN,
  };
  const shower = {
    name: "Cold Shower",
    description: "Post-workout recovery.",
    duration: WORKOUT_DURATIONS.COLD_SHOWER,
  };

  switch (day) {
    case 1:
      return {
        name: "Leg Day",
        components: [
          {
            name: "Barbell Squats",
            description: "Heavy compound lift for legs.",
            duration: WORKOUT_DURATIONS.BARBELL,
          },
          ...calisthenics,
          running,
          shower,
        ],
      };
    case 3:
      return {
        name: "Chest Day",
        components: [
          {
            name: "Bench Press",
            description: "Heavy compound lift for chest.",
            duration: WORKOUT_DURATIONS.BARBELL,
          },
          ...calisthenics,
          running,
          shower,
        ],
      };
    case 5:
      return {
        name: "Shoulder Day",
        components: [
          {
            name: "Overhead Press",
            description: "Heavy compound lift for shoulders.",
            duration: WORKOUT_DURATIONS.BARBELL,
          },
          ...calisthenics,
          running,
          shower,
        ],
      };
    case 0:
      return {
        name: "Back Day",
        components: [
          {
            name: "Deadlifts",
            description: "Heavy compound lift for back.",
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

function getMealForDay(
  day: number,
  mealNumber: 1 | 2 | 3,
): { name: string; description: string } {
  const weeklyMenu = [
    {
      1: {
        name: "Breakfast",
        description:
          "Oat Pancake (1/2 cup oats + 1 egg) with 3 whole eggs (soft yolk) and 1/2 avocado.\nGlass of whole milk, 1 banana, and 2 Brazil nuts.",
      },
      2: {
        name: "Lunch",
        description:
          "6oz halal ground beef, 1 cup cooked rice, sautéed spinach (olive oil + garlic).\nSide: 1/2 avocado, 1/2 cup full-fat Greek yogurt with honey.",
      },
      3: {
        name: "Dinner",
        description:
          "6oz wild-caught salmon, 1/2 cup cooked quinoa, large spinach salad with olive oil dressing.",
      },
    },
    {
      1: {
        name: "Breakfast",
        description:
          "Oat Pancake (1/2 cup oats + 1 egg) with 3 sunny side up eggs and 1/2 avocado.\nWhole milk + 2 Brazil nuts, 1/4 cup blueberries.",
      },
      2: {
        name: "Lunch",
        description:
          "8oz halal ground beef (80/20) over white rice, cooked in beef tallow.\nSide: pickled cucumber + 1/2 avocado.",
      },
      3: {
        name: "Dinner",
        description:
          "Cottage cheese with honey and berries.\nGlass of kefir or yogurt-based drink.",
      },
    },
    {
      1: {
        name: "Breakfast",
        description:
          "Oat Pancake (1/2 cup oats + 1 egg) with 3 whole eggs and 1/2 avocado.\nGreek yogurt bowl with banana, cinnamon, and 2 Brazil nuts.",
      },
      2: {
        name: "Lunch",
        description:
          "8oz chicken thighs (pan-fried), 1 cup basmati rice, steamed broccoli with olive oil.",
      },
      3: {
        name: "Dinner",
        description:
          "6oz cod, roasted asparagus, 1/2 cup cooked lentils with cumin.",
      },
    },
    {
      1: {
        name: "Breakfast",
        description:
          "3 soft-boiled eggs, Greek yogurt + berries, oat pancake (as usual), 1/2 avocado, 2 Brazil nuts.",
      },
      2: {
        name: "Lunch",
        description:
          "8oz sirloin steak with large mixed greens salad (olive oil, lemon).",
      },
      3: {
        name: "Dinner",
        description: "8oz ground turkey, black beans, corn salsa, 1/2 avocado.",
      },
    },
    {
      1: {
        name: "Breakfast",
        description:
          "3 fried eggs, 1/2 avocado, 1 oat pancake, 2 Brazil nuts, whole milk.",
      },
      2: {
        name: "Lunch",
        description:
          "3 grilled lamb chops, 1/2 cup couscous, grilled zucchini with olive oil.",
      },
      3: {
        name: "Dinner",
        description:
          "Chicken + vegetable soup (carrots, celery, onion, chicken), 1 slice sourdough bread.",
      },
    },
    {
      1: {
        name: "Breakfast",
        description:
          "3 eggs (scrambled), Greek yogurt smoothie with banana and peanut butter, oat pancake, 2 Brazil nuts.",
      },
      2: {
        name: "Lunch",
        description:
          "Quinoa bowl: shredded chicken, chickpeas, cucumber, tahini drizzle.",
      },
      3: {
        name: "Dinner",
        description: "8oz baked salmon, roasted potatoes, sautéed green beans.",
      },
    },
    {
      1: {
        name: "Breakfast",
        description:
          "3 sunny side up eggs, oat pancake, full-fat yogurt, 2 Brazil nuts, 1 banana.",
      },
      2: {
        name: "Lunch",
        description:
          "Beef stew (8oz beef, carrots, potatoes, onion), slow cooked.",
      },
      3: {
        name: "Dinner",
        description:
          "8oz grilled chicken breast, 1/2 cup Greek yogurt with honey, mixed greens salad.",
      },
    },
  ];
  return weeklyMenu[day][mealNumber];
}

// =================================================================
//  THE CORE SCHEDULING ENGINE
// =================================================================
export function calculateStrictSchedule(
  prayerTimes: PrayerTimes,
  timezone: string,
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
    TAHAJJUD_DURATION = 30,
    TARGET_SLEEP_HOURS = 9;

  const fajrTime = parseTime(prayerTimes.Fajr, timezone),
    dhuhrTime = parseTime(prayerTimes.Dhuhr, timezone),
    asrTime = parseTime(prayerTimes.Asr, timezone),
    maghribTime = parseTime(prayerTimes.Maghrib, timezone),
    ishaTime = parseTime(prayerTimes.Isha, timezone);
  const ishaEndTime = addMinutes(ishaTime, PRAYER_DURATIONS.ISHA),
    fajrEndTime = addMinutes(fajrTime, PRAYER_DURATIONS.FAJR),
    dhuhrEndTime = addMinutes(dhuhrTime, PRAYER_DURATIONS.DHUHR),
    maghribEndTime = addMinutes(maghribTime, PRAYER_DURATIONS.MAGHRIB);

  const tahajjudLatestStartTime = subtractMinutes(fajrTime, 60);
  const idealWakeUpTime = addMinutes(ishaEndTime, TARGET_SLEEP_HOURS * 60);
  const actualWakeUpTime =
    idealWakeUpTime > tahajjudLatestStartTime
      ? tahajjudLatestStartTime
      : idealWakeUpTime;

  let nightSleepMillis = actualWakeUpTime.getTime() - ishaEndTime.getTime();
  if (nightSleepMillis < 0) nightSleepMillis += 24 * 60 * 60 * 1000;
  const nightSleepMinutes = nightSleepMillis / 60000;

  const sleepDeficitMinutes = Math.max(
    0,
    TARGET_SLEEP_HOURS * 60 - nightSleepMinutes,
  );
  const needsNap = sleepDeficitMinutes > 15;

  const dailyWorkout = getWorkoutForDay(dayOfWeek);
  const meal1Data = getMealForDay(dayOfWeek, 1),
    meal2Data = getMealForDay(dayOfWeek, 2),
    meal3Data = getMealForDay(dayOfWeek, 3);

  const schedule: ScheduleItem[] = [];
  let ptr = actualWakeUpTime;

  // FIX: The `morningTasks` array now contains items that all have a `description`.
  const morningTasks = [
    { ...meal1Data, duration: MEAL_DURATION },
    ...dailyWorkout.components,
  ];

  schedule.push({
    name: "Tahajjud",
    description: "Connect with Allah in the blessed hours.",
    startTime: ptr,
    endTime: (ptr = addMinutes(ptr, TAHAJJUD_DURATION)),
  });

  for (const task of morningTasks) {
    const taskStartTime = ptr;
    const taskEndTime = addMinutes(taskStartTime, task.duration);

    if (taskEndTime <= fajrTime) {
      schedule.push({
        name: task.name,
        description: task.description,
        startTime: taskStartTime,
        endTime: taskEndTime,
      });
      ptr = taskEndTime;
    } else if (taskStartTime < fajrTime) {
      const durationBeforeFajr =
        (fajrTime.getTime() - taskStartTime.getTime()) / 60000;
      if (durationBeforeFajr > 1)
        schedule.push({
          name: `${task.name} (Part 1)`,
          description: task.description,
          startTime: taskStartTime,
          endTime: fajrTime,
        });
      schedule.push({
        name: "Fajr Prayer",
        description: "Dawn prayer.",
        startTime: fajrTime,
        endTime: fajrEndTime,
      });
      const durationAfterFajr = task.duration - durationBeforeFajr;
      if (durationAfterFajr > 1)
        schedule.push({
          name: `${task.name} (Part 2)`,
          description: task.description,
          startTime: fajrEndTime,
          endTime: addMinutes(fajrEndTime, durationAfterFajr),
        });
      ptr = addMinutes(fajrEndTime, durationAfterFajr);
    } else {
      ptr = new Date(Math.max(ptr.getTime(), fajrEndTime.getTime()));
      const newTaskStartTime = ptr;
      const newTaskEndTime = addMinutes(newTaskStartTime, task.duration);
      schedule.push({
        name: task.name,
        description: task.description,
        startTime: newTaskStartTime,
        endTime: newTaskEndTime,
      });
      ptr = newTaskEndTime;
    }
  }

  ptr = new Date(Math.max(ptr.getTime(), fajrEndTime.getTime()));

  schedule.push({
    name: "Deep Work & Responsibilities",
    description: "Focused work sessions, studies, and life duties.",
    startTime: ptr,
    endTime: dhuhrTime,
  });
  schedule.push({
    name: "Dhuhr Prayer",
    description: "Midday prayer.",
    startTime: dhuhrTime,
    endTime: (ptr = dhuhrEndTime),
  });

  if (needsNap) {
    schedule.push({
      name: "Recharge Nap",
      description: `Making up for sleep deficit (${sleepDeficitMinutes.toFixed(0)} min).`,
      startTime: ptr,
      endTime: (ptr = addMinutes(ptr, sleepDeficitMinutes)),
    });
  }

  schedule.push({
    name: meal2Data.name,
    description: meal2Data.description,
    startTime: ptr,
    endTime: (ptr = addMinutes(ptr, MEAL_DURATION)),
  });
  schedule.push({
    name: "Responsibilities",
    description: "Afternoon duties and tasks.",
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
    name: "Responsibilities",
    description: "Pre-sunset tasks and wind-down.",
    startTime: ptr,
    endTime: maghribTime,
  });
  schedule.push({
    name: "Maghrib Prayer",
    description: "Sunset prayer.",
    startTime: maghribTime,
    endTime: (ptr = maghribEndTime),
  });

  schedule.push({
    name: meal3Data.name,
    description: meal3Data.description,
    startTime: ptr,
    endTime: (ptr = addMinutes(ptr, MEAL_DURATION)),
  });
  schedule.push({
    name: "Screen Shutdown & Wind Down",
    description: "No screens. Prepare for sleep, read, reflect.",
    startTime: ptr,
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
    description: `Target: ${TARGET_SLEEP_HOURS} hours.`,
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
