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
  id: string; // Renamed from activityId and made mandatory
  // Properties from CustomActivity to make types compatible
  type?: ActivityType;
  duration?: number;
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

export type DowntimeActivityType = 'duration' | 'interrupt';

export interface DowntimeActivity {
  name: string;
  duration: number; // in minutes
  type: DowntimeActivityType;
}

export interface PausedState {
  activity: DowntimeActivity;
  timeRemaining: number; // in seconds
}

export interface DowntimeState {
  activities: DowntimeActivity[];
  currentActivityIndex: number;
  currentActivityStartTime: string | null;
  gripStrengthEnabled: boolean;
  lastGripTime: string | null;
  pausedState: PausedState | null;
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
  mealLog?: MealLog[];
}

export interface MealLog {
  id: string;
  timestamp: string;
  mealType: MealMode;
  description: string;
} 