"use client";

import { useState, useEffect, useCallback } from "react";
import { ScheduleItem, MealMode, AppMode, UserSettings } from "@/lib/types";
import { LocationPrompt } from "@/components/LocationPrompt";
import { LoadingState } from "@/components/LoadingState";
import { ScheduleView } from "@/components/ScheduleView";
import { calculateSchedule } from "@/lib/schedule-logic";

interface ViewState {
  settings: UserSettings | null;
  schedule: ScheduleItem[] | null;
  currentActivity: ScheduleItem | null;
  nextActivity: ScheduleItem | null;
  timeUntilNext: string;
  loading: boolean;
  error: string | null;
}

export default function SalahSync() {
  const [viewState, setViewState] = useState<ViewState>({
    settings: null,
    schedule: null,
    currentActivity: null,
    nextActivity: null,
    timeUntilNext: "",
    loading: true,
    error: null,
  });

  const handleError = (message: string, error?: any) => {
    console.error(message, error);
    setViewState(prev => ({ ...prev, loading: false, error: message }));
  };

  const fetchFullSchedule = useCallback(async (settings: UserSettings) => {
    if (!settings.latitude || !settings.longitude || !settings.timezone) return null;
    try {
      // This is a bit of a hack. The cron job is the source of truth, but we need the prayer times to show the full schedule.
      // In a future version, the full schedule could be stored in KV by the cron job.
      const today = new Date();
      const url = `https://api.aladhan.com/v1/timings/${today.getDate()}-${today.getMonth() + 1}-${today.getFullYear()}?latitude=${settings.latitude}&longitude=${settings.longitude}&method=2`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch prayer times for schedule view");
      const data = await res.json();
      if (!data.data || !data.data.timings) throw new Error("Invalid prayer times data");
      
      const { schedule, current, next } = calculateSchedule(data.data.timings, settings.timezone, settings.mealMode);
      
      return { schedule, current, next };
    } catch (err) {
      handleError("Could not calculate the full schedule.", err);
      return null;
    }
  }, []);
  
  const syncWithServer = useCallback(async (showLoading = true) => {
    if (showLoading) {
      setViewState(prev => ({ ...prev, loading: true, error: null }));
    }
  
    try {
      const response = await fetch('/api/settings');
      if (!response.ok) {
        if (response.status === 404) {
          // No settings yet, prompt for location.
          setViewState(prev => ({ ...prev, loading: false, settings: null })); 
        } else {
          throw new Error(`Server error: ${response.statusText}`);
        }
        return;
      }
  
      const settings: UserSettings = await response.json();
      const scheduleData = await fetchFullSchedule(settings);

      if (!scheduleData) {
        // If schedule calculation fails, we can still show basic info
        setViewState(prev => ({ ...prev, settings, loading: false }));
        return;
      }

      // Determine current activity based on mode
      let currentActivity = scheduleData.current;
      if (settings.mode === 'downtime' && settings.downtime) {
        const { currentActivity: downtimeActivityName, activityStartTime } = settings.downtime;
        
        if (downtimeActivityName && activityStartTime) {
          const duration = downtimeActivityName === "Grip Strength Training" ? 1 : 30;
          const endTime = new Date(activityStartTime);
          endTime.setMinutes(endTime.getMinutes() + duration);

          currentActivity = {
            name: downtimeActivityName,
            description: settings.downtime.lastNotifiedActivity || "Downtime activity in progress.",
            startTime: new Date(activityStartTime),
            endTime: endTime,
          };
        }
      }
      
      setViewState({
        settings,
        schedule: scheduleData.schedule,
        currentActivity,
        nextActivity: scheduleData.next,
        timeUntilNext: formatTimeUntil(scheduleData.next.startTime),
        loading: false,
        error: null,
      });
  
    } catch (e) {
      handleError("Failed to sync with the server.", e);
    }
  }, [fetchFullSchedule]);
  
  useEffect(() => {
    syncWithServer(); // Initial sync
  
    // Logic to sync with the cron job's 1-minute interval
    const interval = setInterval(() => {
      const seconds = new Date().getSeconds();
      if (seconds === 1) { // Sync 1 second after the minute starts
        syncWithServer(false);
      }
    }, 1000); // Check every second
  
    return () => clearInterval(interval);
  }, [syncWithServer]);

  // Update countdown timer every second
  useEffect(() => {
    const timer = setInterval(() => {
      setViewState(prev => {
        if (!prev.nextActivity?.startTime) return prev;
        return { ...prev, timeUntilNext: formatTimeUntil(prev.nextActivity.startTime) };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const updateServer = async (payload: object) => {
    setViewState(prev => ({ ...prev, loading: true }));
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(`Server update failed: ${response.statusText}`);
      
      // Re-sync to get the canonical state from the server
      await syncWithServer(false);

    } catch (e) {
      handleError("Failed to update preferences.", e);
      await syncWithServer(true); // Attempt to recover state
    }
  };

  const toggleDowntimeMode = () => updateServer({ action: "toggle_mode" });
  const handleSetMealMode = (mode: MealMode) => updateServer({ action: 'set_meal_mode', mode });
  const handleSetGripEnabled = (isEnabled: boolean) => updateServer({ action: 'toggle_grip_enabled', isEnabled });

  const requestLocation = async () => {
    setViewState(prev => ({ ...prev, loading: true, error: null }));
    try {
      if (!navigator.geolocation) throw new Error("Geolocation is not supported by your browser.");
      const pos = await new Promise<GeolocationPosition>((res, rej) => navigator.geolocation.getCurrentPosition(res, rej));
      const { latitude, longitude } = pos.coords;
      
      let city = "Unknown City";
      try {
        const geoRes = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`);
        if (geoRes.ok) { const data = await geoRes.json(); city = data.city || data.locality || "Unknown"; }
      } catch (e) { console.warn("Could not get city name:", e); }
      
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const initialSettings: Partial<UserSettings> = { latitude, longitude, city, timezone, mode: 'strict', mealMode: 'maintenance', lastNotifiedActivity: '' };
      
      await updateServer({ action: 'setup_location', ...initialSettings }); // A new action
      await syncWithServer();
    } catch (err) {
      handleError("Could not get your location.", err);
    }
  };
  
  const resetLocation = async () => {
    setViewState({ loading: true, error: null, settings: null, schedule: null, currentActivity: null, nextActivity: null, timeUntilNext: '' });
    // We can also ask the server to delete the settings
    await fetch("/api/settings", { method: "DELETE" }); // Implement DELETE on the server
    window.location.reload();
  };

  const formatTimeUntil = (targetTime: Date): string => {
    if (!targetTime) return "";
    let diff = targetTime.getTime() - new Date().getTime();
    if (diff < 0) return "Now";
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return hours > 0 ? `${hours}h ${minutes}m` : (minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`);
  };

  if (viewState.loading && !viewState.settings) return <LoadingState />;
  if (!viewState.settings) return <LocationPrompt requestLocation={requestLocation} error={viewState.error || ""} />;
  if (!viewState.currentActivity) return <LoadingState message="Calculating Schedule..." description="Building your optimized daily routine..." />;

  return (
    <ScheduleView
      downtimeMode={viewState.settings.mode === 'downtime'}
      gripStrengthEnabled={viewState.settings.downtime?.gripStrengthEnabled ?? true}
      handleSetGripEnabled={handleSetGripEnabled}
      currentActivity={viewState.currentActivity}
      nextActivity={viewState.nextActivity?.name || "..."}
      timeUntilNext={viewState.timeUntilNext}
      mealMode={viewState.settings.mealMode}
      handleSetMealMode={handleSetMealMode}
      resetLocation={resetLocation}
      toggleDowntimeMode={toggleDowntimeMode}
      schedule={viewState.schedule || []}
    />
  );
}
