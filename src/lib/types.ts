export type MealMode = 'cutting' | 'maintenance' | 'bulking' | 'log';
export type AppMode = 'strict' | 'downtime';
export type ActivityType = 'filler' | 'action';

export interface PrayerTimes {
  [key: string]: string;
}

export interface CustomActivity {
  id: string;
  name: string;
  type: ActivityType;
  duration?: number; // in minutes
}

export interface ScheduleItem {
  id: string;
  name: string;
  startTime: Date;
  endTime: Date;
  isPrayer: boolean;
  description: string;
}

export interface DowntimeSettings {
  activities: CustomActivity[];
  currentActivityIndex: number;
  currentActivityStartTime: number; // Stored as timestamp
  lastGripTime: number; // Stored as timestamp
  pausedState?: {
    activity: CustomActivity;
    remainingTime: number; // in milliseconds
  };
  gripStrengthEnabled: boolean;
}

export interface UserSettings {
  latitude: number;
  longitude: number;
  city: string;
  timezone: string;
  method: number; // For prayer time calculations
  school: number; // For prayer time calculations
  mode: AppMode;
  downtime?: DowntimeSettings;
  customActivities: CustomActivity[];
  mealMode: MealMode;
  meals: {
    // Log mode does not have pre-defined meals
    [key in 'cutting' | 'maintenance' | 'bulking']: {
      breakfast: string;
      lunch: string;
      dinner: string;
    };
  };
  mealLog?: { meal: string; timestamp: number }[];
  lastNotifiedActivity?: string;
}

export interface MealLog {
  id: `${string}-${string}-${string}-${string}-${string}`;
  timestamp: string;
  mealType: MealMode;
  description: string;
}