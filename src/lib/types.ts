export type MealMode = 'cut' | 'maintain' | 'bulk' | 'log';
export type AppMode = 'normal' | 'downtime';
// ActivityType now includes 'filler' for backward compatibility and general use.
export type ActivityType = 'filler' | 'action' | 'interrupt';

export interface PrayerTimes {
  [key: string]: string;
}

export interface CustomActivity {
  id: string;
  name: string;
  duration?: number; // in minutes, optional for flexibility
  type: ActivityType;
}

export interface ScheduleItem {
  id: string;
  name: string;
  startTime: Date;
  endTime: Date;
  isPrayer: boolean;
  description: string;
  isCustom: boolean;
}

// Restoring DowntimeSettings to its original structure to fix widespread errors.
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
  startTime: string; // e.g., "22:00"
  endTime: string;   // e.g., "06:00"
}

export interface FixedMeals {
  breakfast?: string;
  lunch?: string;
  dinner?: string;
}

// This is the single source of truth for the UserSettings structure.
// It includes legacy fields for migration purposes.
export interface UserSettings {
  // Legacy location fields (to be deprecated)
  latitude?: number;
  longitude?: number;
  timezone?: string;
  city?: string;

  // Legacy prayer calculation fields (to be deprecated)
  method?: number;
  school?: number;

  // New location and prayer calculation fields
  location: {
    city: string;
    country: string;
    latitude: number;
    longitude: number;
  };
  calculationMethod: string;
  madhab: string;

  // Schedule and activity settings
  customActivities: CustomActivity[];
  downtimeMode: boolean;
  downtime?: DowntimeSettings; // Legacy downtime settings

  // Meal tracking settings
  mealMode: MealMode;
  meals: {
      cut: FixedMeals;
      maintain: FixedMeals;
      bulk: FixedMeals;
  };
  foodLog: { entry: string; timestamp: string }[];

  // Deprecated field, replaced by downtimeMode
  mode?: AppMode;

  lastNotifiedActivity: string | null;
}

export interface MealLog {
  id: `${string}-${string}-${string}-${string}-${string}`;
  timestamp: string;
  mealType: MealMode;
  description: string;
}