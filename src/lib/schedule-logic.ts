// src/lib/schedule-logic.ts

import { toZonedTime } from "date-fns-tz";
import { PrayerTimes, ScheduleItem, UserSettings, CustomActivity } from "./types";

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
    activityId: name.toLowerCase(),
});

export function calculateSchedule(
  settings: UserSettings,
  prayerTimes: PrayerTimes,
): { schedule: ScheduleItem[], current: ScheduleItem; next: ScheduleItem } {
  const { timezone, schedule: userSchedule } = settings;
  const now = toZonedTime(new Date(), timezone);
  const today = new Date(now);
  const tomorrow = addMinutes(today, 24 * 60);

  // Get prayer times for today and tomorrow to handle overnight schedules
  const prayerDateTimes = {
    Fajr: parseTime(prayerTimes.Fajr, timezone, today),
    Dhuhr: parseTime(prayerTimes.Dhuhr, timezone, today),
    Asr: parseTime(prayerTimes.Asr, timezone, today),
    Maghrib: parseTime(prayerTimes.Maghrib, timezone, today),
    Isha: parseTime(prayerTimes.Isha, timezone, today),
    NextFajr: parseTime(prayerTimes.Fajr, timezone, tomorrow),
  };

  const timeline: ScheduleItem[] = [];
  const prayerMap = new Map<string, ScheduleItem>();

  // 1. First, create and map all prayer items
  userSchedule.filter(act => ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'].includes(act.id)).forEach(prayerActivity => {
      const prayerKey = prayerActivity.name as keyof typeof prayerDateTimes;
      const prayerItem = createPrayerScheduleItem(prayerActivity.name, prayerDateTimes[prayerKey], prayerActivity.duration || 15);
      prayerMap.set(prayerActivity.id, prayerItem);
  });
  // Add next Fajr for accurate overnight calculation
  prayerMap.set('nextfajr', createPrayerScheduleItem("Next Fajr", prayerDateTimes.NextFajr, 15));


  // 2. Iterate through the user's schedule to place activities between prayers
  for (let i = 0; i < userSchedule.length; i++) {
      const currentActivityConfig = userSchedule[i];
      const nextActivityConfig = userSchedule[(i + 1) % userSchedule.length];
      
      const isCurrentPrayer = prayerMap.has(currentActivityConfig.id);
      if (!isCurrentPrayer) continue; // Should not happen if logic is sound, but good practice

      const startAnchor = prayerMap.get(currentActivityConfig.id)!;
      const endAnchor = prayerMap.get(nextActivityConfig.id) || prayerMap.get('nextfajr')!;

      timeline.push(startAnchor);

      // Get all user activities between these two prayer anchors
      const activitiesInBlock: CustomActivity[] = [];
      let nextIndex = (userSchedule.indexOf(currentActivityConfig) + 1);
      while (userSchedule[nextIndex % userSchedule.length].id !== nextActivityConfig.id) {
          activitiesInBlock.push(userSchedule[nextIndex % userSchedule.length]);
          nextIndex++;
      }
      
      const blockStartTime = startAnchor.endTime;
      const blockEndTime = endAnchor.startTime;
      const totalBlockMinutes = (blockEndTime.getTime() - blockStartTime.getTime()) / 60000;

      // If there are no activities, create a single "Free Time" block.
      if (activitiesInBlock.length === 0 && totalBlockMinutes > 1) {
        timeline.push({
          name: "Free Time",
          description: "Add an activity here!",
          startTime: blockStartTime,
          endTime: blockEndTime,
          isPrayer: false,
          activityId: `free-${startAnchor.activityId}`,
        });
        continue; // Move to the next prayer block
      }

      const actionMinutes = activitiesInBlock.filter(a => a.type === 'action').reduce((sum, a) => sum + (a.duration || 0), 0);
      const fillerCount = activitiesInBlock.filter(a => a.type === 'filler').length;
      
      // Prevent division by zero if there are actions but no fillers.
      const availableMinutesForFillers = totalBlockMinutes - actionMinutes;
      const fillerMinutes = fillerCount > 0 ? availableMinutesForFillers / fillerCount : 0;

      let currentTime = blockStartTime;
      activitiesInBlock.forEach(activity => {
          const duration = activity.type === 'action' ? (activity.duration || 0) : fillerMinutes;
          const endTime = addMinutes(currentTime, duration);
          timeline.push({
              name: activity.name,
              description: `${activity.type} activity`,
              startTime: new Date(currentTime),
              endTime: endTime,
              isPrayer: false,
              activityId: activity.id,
          });
          currentTime = endTime;
      });
  }

  const sortedSchedule = timeline.filter(item => item.endTime > item.startTime).sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  let currentIndex = sortedSchedule.findIndex(item => now >= item.startTime && now < item.endTime);

  if (currentIndex === -1) {
    const nextActivityIndex = sortedSchedule.findIndex(item => item.startTime > now);
    if (nextActivityIndex > 0) {
      const prev = sortedSchedule[nextActivityIndex - 1];
      return { schedule: sortedSchedule, current: { name: "Transition", description: `Preparing for ${sortedSchedule[nextActivityIndex].name}`, startTime: prev.endTime, endTime: sortedSchedule[nextActivityIndex].startTime, isPrayer: false }, next: sortedSchedule[nextActivityIndex] };
    }
    // If we are still without a current activity, it's likely because we are in a "Free Time" block that hasn't been explicitly found.
    // Let's find the Free Time block manually.
    const freeTimeIndex = sortedSchedule.findIndex(item => item.name === 'Free Time' && now >= item.startTime && now < item.endTime);
    if (freeTimeIndex !== -1) {
        currentIndex = freeTimeIndex;
    } else {
        const fallback = { name: "Ready", description: "All activities complete for now.", startTime: now, endTime: now, isPrayer: false };
        return { schedule: sortedSchedule, current: fallback, next: sortedSchedule[0] || fallback };
    }
  }

  const current = sortedSchedule[currentIndex];
  const next = sortedSchedule[(currentIndex + 1) % sortedSchedule.length];
  
  return { schedule: sortedSchedule, current, next };
}
