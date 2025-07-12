export interface Location {
  latitude: number;
  longitude: number;
  city: string;
  timezone?: string;
}

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
  isPrayer: boolean;
  activityId?: string;
}

export type MealMode = "bulking" | "maintenance" | "cutting";
export type AppMode = "strict" | "downtime";
export type ActivityType = "filler" | "action";

export interface CustomActivity {
  id: string;
  name: string;
  type: ActivityType;
  duration?: number; // In minutes, for 'action' type
}

export interface DowntimeState {
  lastNotifiedActivity: string;
  currentActivity: string;
  activityStartTime: string | null;
  lastGripTime: string | null;
  gripStrengthEnabled: boolean;
  quranTurn: boolean;
  timeRemainingOnPause: number | null; 
  activityBeforePause: string | null;
}

export interface UserSettings {
  latitude: number;
  longitude: number;
  timezone: string;
  city?: string;
  mode: AppMode;
  mealMode: MealMode;
  lastNotifiedActivity: string;
  downtime: Partial<DowntimeState>;
  schedule: CustomActivity[];
} 