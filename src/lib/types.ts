export interface Location {
  latitude: number;
  longitude: number;
  city: string;
  timezone?: string;
}

export interface DowntimeActivity {
  name: string;
  description: string;
  duration: number;
  type: "grip" | "quran" | "leetcode";
} 