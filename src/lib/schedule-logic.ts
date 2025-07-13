// src/lib/schedule-logic.ts

import { toZonedTime } from "date-fns-tz";
import { PrayerTimes, ScheduleItem, UserSettings } from "./types";

export const addMinutes = (date: Date, minutes: number): Date => new Date(date.getTime() + minutes * 60000);

export const parseTime = (timeString: string, timezone: string, referenceDate: Date): Date => {
  const [hours, minutes] = timeString.split(":").map(Number);
  const zonedDate = toZonedTime(referenceDate, timezone);
  zonedDate.setHours(hours, minutes, 0, 0);
  // If the parsed time is before the reference date (e.g., parsing Isha for the previous day), adjust it
  if (zonedDate > referenceDate) {
    zonedDate.setDate(zonedDate.getDate() - 1);
  }
  return zonedDate;
};

// A helper function to create a schedule item for a prayer
const createPrayerScheduleItem = (name: string, time: Date, duration: number): ScheduleItem => ({
    name,
    description: "Prayer time",
    startTime: time,
    endTime: addMinutes(time, duration),
    isPrayer: true,
    id: name.toLowerCase(),
    isCustom: false,
});

export function calculateSchedule(
  settings: UserSettings,
  prayerTimes: PrayerTimes,
): { schedule: ScheduleItem[], current: ScheduleItem; next: ScheduleItem } {
  const timezone = settings.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const { customActivities: userSchedule = [] } = settings;

  if (!timezone) {
    const now = new Date();
    const errorItem: ScheduleItem = {
      id: 'error',
      name: 'Configuration Error',
      description: 'Timezone is not set in user settings.',
      startTime: now,
      endTime: now,
      isPrayer: false,
      isCustom: false,
    };
    return { schedule: [errorItem], current: errorItem, next: errorItem };
  }

  const now = toZonedTime(new Date(), timezone);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const tomorrow = addMinutes(today, 24 * 60);

  type ValidatedPrayerTimes = { [K in Exclude<keyof PrayerTimes, 'Sunrise' | 'NextFajr'>]: string };
  const validatedPrayerTimes = {} as ValidatedPrayerTimes;

  const requiredPrayers: (keyof ValidatedPrayerTimes)[] = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];

  for (const prayer of requiredPrayers) {
    const time = prayerTimes[prayer];
    if (!time) {
      const errorItem: ScheduleItem = {
        id: 'error',
        name: 'Configuration Error',
        description: `Missing prayer time for ${prayer}`,
        startTime: now,
        endTime: now,
        isPrayer: false,
        isCustom: false,
      };
      return { schedule: [errorItem], current: errorItem, next: errorItem };
    }
    validatedPrayerTimes[prayer] = time;
  }

  // The validatedPrayerTimes object is now guaranteed to be populated with strings.
  const prayerDateTimes = {
    Fajr: parseTime(validatedPrayerTimes.Fajr, timezone, today),
    Dhuhr: parseTime(validatedPrayerTimes.Dhuhr, timezone, today),
    Asr: parseTime(validatedPrayerTimes.Asr, timezone, today),
    Maghrib: parseTime(validatedPrayerTimes.Maghrib, timezone, today),
    Isha: parseTime(validatedPrayerTimes.Isha, timezone, today),
    NextFajr: parseTime(validatedPrayerTimes.Fajr, timezone, tomorrow),
  };

  const timeline: ScheduleItem[] = [];

  // 1. Create obligatory prayers first (use custom duration if provided)
  const obligatoryPrayers: { key: keyof typeof prayerDateTimes; id: string; defaultDuration: number }[] = [
    { key: 'Fajr', id: 'fajr', defaultDuration: 15 },
    { key: 'Dhuhr', id: 'dhuhr', defaultDuration: 15 },
    { key: 'Asr', id: 'asr', defaultDuration: 15 },
    { key: 'Maghrib', id: 'maghrib', defaultDuration: 15 },
    { key: 'Isha', id: 'isha', defaultDuration: 15 },
  ];

  obligatoryPrayers.forEach(({ key, id, defaultDuration }) => {
    const custom = userSchedule.find(a => a.id === id);
    timeline.push(createPrayerScheduleItem(key, prayerDateTimes[key], custom?.duration || defaultDuration));
  });

  const fajr = timeline.find(p => p.id === 'fajr')!;
  const dhuhr = timeline.find(p => p.id === 'dhuhr')!;
  const maghrib = timeline.find(p => p.id === 'maghrib')!;
  const isha = timeline.find(p => p.id === 'isha')!;
  const nextFajr = createPrayerScheduleItem("Next Fajr", prayerDateTimes.NextFajr, 15);

  // 2. Calculate and add Sleep and Tahajjud
  const sleepWindowStart = isha.endTime;
  const sleepWindowEnd = addMinutes(nextFajr.startTime, -10); // End 10 mins before next Fajr
  const totalSleepWindowMinutes = (sleepWindowEnd.getTime() - sleepWindowStart.getTime()) / 60000;
  
  const IDEAL_SLEEP_MINS = 9 * 60;
  let tahajjudDuration = 0;
  let sleepDuration = totalSleepWindowMinutes;
  let sleepDeficit = IDEAL_SLEEP_MINS - sleepDuration;

  if (totalSleepWindowMinutes >= IDEAL_SLEEP_MINS) {
    const availableForTahajjud = totalSleepWindowMinutes - IDEAL_SLEEP_MINS;
    if (availableForTahajjud >= 30) tahajjudDuration = 30;
    else if (availableForTahajjud >= 20) tahajjudDuration = 20;
    else if (availableForTahajjud >= 10) tahajjudDuration = 10;
    else if (availableForTahajjud >= 5) tahajjudDuration = 5;
    
    sleepDuration = IDEAL_SLEEP_MINS;
    sleepDeficit = 0;
  }

  const tahajjudStartTime = addMinutes(sleepWindowStart, totalSleepWindowMinutes - sleepDuration - tahajjudDuration);
  if (tahajjudDuration > 0) {
    timeline.push({
      id: 'tahajjud',
      name: 'Tahajjud',
      description: `${tahajjudDuration} minutes of night prayer`,
      startTime: tahajjudStartTime,
      endTime: addMinutes(tahajjudStartTime, tahajjudDuration),
      isPrayer: true,
      isCustom: false,
    });
  }

  const sleepStartTime = addMinutes(tahajjudStartTime, tahajjudDuration);
  timeline.push({
    id: 'sleep',
    name: 'Sleep',
    description: 'Uninterrupted rest',
    startTime: sleepStartTime,
    endTime: addMinutes(sleepStartTime, sleepDuration),
    isPrayer: false, // Not a prayer, but a core activity
    isCustom: false,
  });

  // 3. Add Meals and Nap
  const breakfast = {
    id: 'breakfast',
    name: 'Breakfast',
    description: 'First meal of the day',
    startTime: fajr.endTime,
    endTime: addMinutes(fajr.endTime, 30),
    isPrayer: false,
    isCustom: false,
  };
  timeline.push(breakfast);

  let postDhuhrActivityStart = dhuhr.endTime;
  if (sleepDeficit > 0) {
    const nap = {
      id: 'nap',
      name: 'Nap',
      description: `Catching up on ${Math.round(sleepDeficit)} minutes of sleep`,
      startTime: dhuhr.endTime,
      endTime: addMinutes(dhuhr.endTime, sleepDeficit),
      isPrayer: false,
      isCustom: false,
    };
    timeline.push(nap);
    postDhuhrActivityStart = nap.endTime;
  }

  const lunch = {
    id: 'lunch',
    name: 'Lunch',
    description: 'Mid-day meal',
    startTime: postDhuhrActivityStart,
    endTime: addMinutes(postDhuhrActivityStart, 30),
    isPrayer: false,
    isCustom: false,
  };
  timeline.push(lunch);

  const dinner = {
    id: 'dinner',
    name: 'Dinner',
    description: 'Final meal of the day',
    startTime: addMinutes(maghrib.startTime, -30),
    endTime: maghrib.startTime,
    isPrayer: false,
    isCustom: false,
  };
  timeline.push(dinner);

  // 4. Find free time slots and distribute user-defined activities
  const sortedTimeline = timeline.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  const freeSlots: { start: Date, end: Date, duration: number }[] = [];

  // 4. Calculate end times
  const finalSchedule = sortedTimeline.map((item, index) => {
    if (item.endTime) return item; // Downtime items have pre-calculated end times

    const nextItem = sortedTimeline[index + 1];
    // If this is the last item of the day, its end time is the next day's Fajr
    item.endTime = nextItem ? nextItem.startTime : prayerDateTimes.NextFajr;
    return item;
  });

  for (let i = 0; i < finalSchedule.length - 1; i++) {
    const currentItem = finalSchedule[i];
    const nextItem = finalSchedule[i + 1];
    if (!currentItem || !nextItem) continue;
    if (!currentItem.endTime || !nextItem.startTime) continue;
    const gap = nextItem.startTime.getTime() - currentItem.endTime.getTime();
    if (gap > 0) {
      freeSlots.push({ start: currentItem.endTime, end: nextItem.startTime, duration: gap / 60000 });
    }
  }
  // Also check gap between the last item and the start of the sleep block.
  const lastItem = finalSchedule[finalSchedule.length - 1];
  const sleepItem = finalSchedule.find(item => item.id === 'sleep');
  if (sleepItem && lastItem.endTime < sleepItem.startTime) {
    const gap = sleepItem.startTime.getTime() - lastItem.endTime.getTime();
    if (gap > 0) {
      freeSlots.push({ start: lastItem.endTime, end: sleepItem.startTime, duration: gap / 60000 });
    }
  }

  const userActivities = userSchedule.filter(act => !['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'].includes(act.id));
  const actionActivities = userActivities.filter(a => a.type === 'action');
  const fillerActivities = userActivities.filter(a => a.type === 'filler');

  const totalActionMinutes = actionActivities.reduce((sum, a) => sum + (a.duration || 0), 0);
  const totalFreeMinutes = freeSlots.reduce((sum, s) => sum + s.duration, 0);
  const availableMinutesForFillers = totalFreeMinutes - totalActionMinutes;
  const fillerMinutes = fillerActivities.length > 0 ? availableMinutesForFillers / fillerActivities.length : 0;

  let activityCursor = 0;
  freeSlots.forEach(slot => {
    let currentTime = slot.start;
    // A more sophisticated logic could be implemented to decide which activities go into which slot
    // For now, we just process them in order.
    while(activityCursor < userActivities.length) {
      const activity = userActivities[activityCursor];
      const duration = activity.type === 'action' ? (activity.duration || 0) : fillerMinutes;
      const endTime = addMinutes(currentTime, duration);

      if (endTime <= slot.end) {
        timeline.push({
          ...activity,
          description: `${activity.name} activity`,
          startTime: currentTime,
          endTime: endTime,
          isPrayer: false,
          isCustom: true,
        });
        currentTime = endTime;
        activityCursor++;
      } else {
        break; // Activity doesn't fit, move to next slot
      }
    }
  });

  // 5. Finalize and find current/next
  const sortedSchedule = timeline
    .filter(item => item.endTime > item.startTime) // Ensure valid duration
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  let currentIndex = sortedSchedule.findIndex(item => now >= item.startTime && now < item.endTime);

  if (currentIndex === -1) {
    const nextActivityIndex = sortedSchedule.findIndex(item => item.startTime > now);
    if (nextActivityIndex !== -1) {
      const prevEndTime = nextActivityIndex > 0 ? sortedSchedule[nextActivityIndex - 1].endTime : now;
      const currentItem = {
        id: 'transition',
        name: 'Free Time',
        description: `Preparing for ${sortedSchedule[nextActivityIndex].name}`,
        startTime: prevEndTime,
        endTime: sortedSchedule[nextActivityIndex].startTime,
        isPrayer: false,
        isCustom: false,
      };
      // Only add transition if it's not overlapping
      if (currentItem.startTime < currentItem.endTime) {
        sortedSchedule.splice(nextActivityIndex, 0, currentItem);
        currentIndex = nextActivityIndex;
      }
    }
  }
  
  // Fallback if still not found
  if (currentIndex === -1) {
    currentIndex = sortedSchedule.length - 1; // Default to last known activity
  }

  const current = sortedSchedule[currentIndex] || { name: "Error", description: "Could not determine current activity.", startTime: now, endTime: now, isPrayer: false, id: "error", isCustom: false };
  const next = sortedSchedule[(currentIndex + 1) % sortedSchedule.length] || current;
  
  return { schedule: sortedSchedule, current, next };
}
