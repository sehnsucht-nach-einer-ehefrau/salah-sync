"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { calculateSchedule, ScheduleItem, PrayerTimes, MealMode, addMinutes, UserSettings, AppMode } from "@/lib/schedule-logic";
import { LocationPrompt } from "@/components/LocationPrompt";
import { LoadingState } from "@/components/LoadingState";
import { ScheduleView } from "@/components/ScheduleView";
import { Location, DowntimeActivity } from "@/lib/types";

export default function SalahSync() {
  const [location, setLocation] = useState<Location | null>(null);
  const [prayerTimes, setPrayerTimes] = useState<PrayerTimes | null>(null);
  const [currentActivity, setCurrentActivity] = useState<ScheduleItem | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [nextActivity, setNextActivity] = useState<string>("");
  const [timeUntilNext, setTimeUntilNext] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  const [appMode, setAppMode] = useState<AppMode>("strict");
  const [gripStrengthEnabled, setGripStrengthEnabled] = useState(true);
  const [currentDowntimeActivity, setCurrentDowntimeActivity] = useState<DowntimeActivity | null>(null);
  const [downtimeStartTime, setDowntimeStartTime] = useState<Date | null>(null);
  const [quranTurn, setQuranTurn] = useState(true);
  const [showDowntimeDialog, setShowDowntimeDialog] = useState(false);
  const [mealMode, setMealMode] = useState<MealMode>("maintenance");

  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  const fetchPrayerTimes = useCallback(async (lat: number, lon: number) => {
    try {
      const today = new Date(); const url = `https://api.aladhan.com/v1/timings/${today.getDate()}-${today.getMonth() + 1}-${today.getFullYear()}?latitude=${lat}&longitude=${lon}&method=2`;
      const res = await fetch(url); if (!res.ok) throw new Error(`Failed to fetch prayer times: ${res.status}`);
      const data = await res.json(); if (data.data && data.data.timings) { setPrayerTimes(data.data.timings); } 
      else { throw new Error("Invalid prayer times data received"); }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to fetch prayer times.";
      setError(errorMessage);
    }
  }, []);

  const processServerSettings = useCallback(async (settings: UserSettings) => {
    if (settings.latitude && settings.longitude && settings.timezone) {
      const loc = { latitude: settings.latitude, longitude: settings.longitude, city: settings.city || 'N/A', timezone: settings.timezone };
      if (!location) setLocation(loc);
      if (!prayerTimes) {
        await fetchPrayerTimes(loc.latitude, loc.longitude);
      }
    }
    
    setAppMode(settings.mode);
    setMealMode(settings.mealMode || 'maintenance');

    if (settings.downtime) {
      setGripStrengthEnabled(settings.downtime.gripStrengthEnabled);
      setQuranTurn(settings.downtime.quranTurn);
      if (settings.downtime.activityStartTime) setDowntimeStartTime(new Date(settings.downtime.activityStartTime));
      
      if (settings.mode === 'downtime') {
        if (settings.downtime.currentActivity === "Grip Strength Training") {
          setCurrentDowntimeActivity({ name: "Grip Strength Training", description: "Time for your grip strength set!", duration: 5, type: "grip" });
        } else if (settings.downtime.currentActivity === "Quran Reading") {
          setCurrentDowntimeActivity({ name: "Quran Reading", description: "Read and reflect on the Quran (30 min)", duration: 30, type: "quran" });
        } else if (settings.downtime.currentActivity === "LeetCode Session") {
          setCurrentDowntimeActivity({ name: "LeetCode Session", description: "Practice coding problems (30 min)", duration: 30, type: "leetcode" });
        } else {
          setCurrentDowntimeActivity(null);
        }
      }
    } else {
      setCurrentDowntimeActivity(null);
    }
  }, [location, prayerTimes, fetchPrayerTimes]);

  const syncWithServer = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const response = await fetch('/api/get-settings');
      if (!response.ok) {
        if (response.status === 404) {
          const savedLocationJSON = localStorage.getItem("salah-sync-location");
          if (savedLocationJSON) setLocation(JSON.parse(savedLocationJSON));
          return;
        }
        throw new Error(`Failed to get settings: ${response.statusText}`);
      }
      
      const settings: UserSettings = await response.json();
      await processServerSettings(settings);

    } catch (e) {
      console.error("Failed to sync with server:", e);
      setError(e instanceof Error ? e.message : "Syncing error.");
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [processServerSettings]);

  useEffect(() => {
    syncWithServer(true);
    audioRef.current = new Audio("data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7blmGgU7k9n1unEiBC13yO/eizEIHWq+8+OWT");
    
    const syncInterval = setInterval(() => syncWithServer(false), 20 * 1000);
    return () => clearInterval(syncInterval);
  }, [syncWithServer]);
  
  useEffect(() => { const timer = setInterval(() => setCurrentTime(new Date()), 1000); return () => clearInterval(timer); }, []);

  const updateServerPreference = async (payload: object) => {
    try {
      const response = await fetch("/api/update-state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(`Server update failed: ${response.statusText}`);
      }
      const data: { success: boolean; settings?: UserSettings } = await response.json();
      if (data.success && data.settings) {
        await processServerSettings(data.settings);
      } else {
        await syncWithServer(false);
      }
    } catch (e) {
      console.error("Failed to update server preference:", e);
      setError(e instanceof Error ? e.message : "Update failed.");
      await syncWithServer(true);
    }
  };

  const toggleDowntimeMode = async () => {
    setShowDowntimeDialog(false);
    setLoading(true);
    await updateServerPreference({ action: "toggle_mode" });
    // The loading state will be turned off by the syncWithServer call
    // inside updateServerPreference, which now gets fresh data faster.
  };
  
  const handleSetMealMode = (mode: MealMode) => {
    const previousMealMode = mealMode;
    setMealMode(mode);
    updateServerPreference({ action: 'set_meal_mode', mode }).catch(() => setMealMode(previousMealMode));
  };
  
  const handleSetGripEnabled = (isEnabled: boolean) => {
    const previousGripState = gripStrengthEnabled;
    setGripStrengthEnabled(isEnabled);
    updateServerPreference({ action: 'toggle_grip_enabled', isEnabled }).catch(() => setGripStrengthEnabled(previousGripState));
  };
  
  const completeGripSet = async () => {
    setLoading(true);
    await updateServerPreference({ action: 'complete_grip' });
  };
  
  const formatTimeUntil = (targetTime: Date): string => {
    const now = new Date();
    let diff = targetTime.getTime() - now.getTime();
    if (diff < 0) diff += 24 * 60 * 60 * 1000;
    if (diff <= 0) return "";
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  };

  const formatDowntimeTimeUntil = useCallback((startTime: Date, duration: number): string => {
      const now = new Date();
      const endTime = addMinutes(startTime, duration);
      const diff = endTime.getTime() - now.getTime();
      if (diff <= 0) return "";
      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
    }, []);

  useEffect(() => {
    if (loading) return;

    if (appMode === 'downtime') {
        if (currentDowntimeActivity && downtimeStartTime) {
            setCurrentActivity({ 
                name: currentDowntimeActivity.name, 
                description: currentDowntimeActivity.description, 
                startTime: downtimeStartTime, 
                endTime: addMinutes(downtimeStartTime, currentDowntimeActivity.duration) 
            });
            const nextName = quranTurn ? "LeetCode Session" : "Quran Reading";
            const remaining = formatDowntimeTimeUntil(downtimeStartTime, currentDowntimeActivity.duration);
            if (currentDowntimeActivity.type === 'grip') {
              setNextActivity(`Resuming: ${nextName}`);
              setTimeUntilNext('');
            } else {
              setNextActivity(nextName);
              setTimeUntilNext(`in ${remaining}`);
            }
        } else {
            setCurrentActivity({ name: "Downtime", description: "Waiting for next cycle...", startTime: new Date(), endTime: new Date() });
            setNextActivity("");
            setTimeUntilNext("");
        }
    } else if (prayerTimes && location?.timezone) {
        const { current, next } = calculateSchedule(prayerTimes, location.timezone, mealMode);
        setCurrentActivity(current);
        setNextActivity(next.name);
        setTimeUntilNext(formatTimeUntil(next.startTime));
    }
  }, [currentTime, appMode, currentDowntimeActivity, downtimeStartTime, prayerTimes, location, mealMode, loading, quranTurn, formatDowntimeTimeUntil]);

  const requestLocation = async () => {
    setLoading(true); setError("");
    try {
      if (!navigator.geolocation) throw new Error("Geolocation is not supported");
      const pos = await new Promise<GeolocationPosition>((res, rej) => navigator.geolocation.getCurrentPosition(res, rej));
      const { latitude, longitude } = pos.coords;
      let city = "Unknown City";
      try {
        const geoRes = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`);
        if (geoRes.ok) { const data = await geoRes.json(); city = data.city || data.locality || "Unknown City"; }
      } catch (e) { console.warn("Could not get city name:", e); }
      
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const initialSettings = { latitude, longitude, city, timezone, mode: 'strict', mealMode: 'maintenance', lastNotifiedActivity: '', downtime: { lastNotifiedActivity: '', currentActivity: '', activityStartTime: null, lastGripTime: null, gripStrengthEnabled: true, quranTurn: true } };
      await fetch('/api/setup-location', { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(initialSettings) });
      await syncWithServer(true);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Unable to get your location.";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const resetLocation = () => { localStorage.clear(); setLocation(null); setPrayerTimes(null); setError(""); setLoading(true); window.location.reload(); };
  
  if (loading) return <LoadingState />;
  if (!location) return <LocationPrompt requestLocation={requestLocation} error={error} />;
  if (!currentActivity) return <LoadingState message="Calculating Schedule" description="Building your optimized daily routine..." />;

  return (
    <ScheduleView
      downtimeMode={appMode === 'downtime'}
      gripStrengthEnabled={gripStrengthEnabled}
      handleSetGripEnabled={handleSetGripEnabled}
      currentActivity={currentActivity}
      currentDowntimeActivity={currentDowntimeActivity}
      completeGripSet={completeGripSet}
      nextActivity={nextActivity}
      timeUntilNext={timeUntilNext}
      mealMode={mealMode}
      handleSetMealMode={handleSetMealMode}
      resetLocation={resetLocation}
      location={location}
      currentTime={currentTime}
      showDowntimeDialog={showDowntimeDialog}
      setShowDowntimeDialog={setShowDowntimeDialog}
      toggleDowntimeMode={toggleDowntimeMode}
    />
  );
}
