"use client";

import { useState, useEffect, useCallback } from "react";
import { ScheduleItem, MealMode, UserSettings, CustomActivity } from "@/lib/types";
import { LocationPrompt } from "@/components/LocationPrompt";
import { LoadingState } from "@/components/LoadingState";
import { ScheduleView } from "@/components/ScheduleView";
import { MainCard } from "@/components/MainCard";
import { calculateSchedule } from "@/lib/schedule-logic";
import { Button } from "@/components/ui/button";

interface ViewState {
  settings: UserSettings | null;
  schedule: ScheduleItem[] | null;
  currentActivity: ScheduleItem | null;
  nextActivity: ScheduleItem | null;
  timeUntilNext: string;
  loading: boolean;
  error: string | null;
}

export default function HomePage() {
  const [viewState, setViewState] = useState<ViewState>({
    settings: null,
    schedule: null,
    currentActivity: null,
    nextActivity: null,
    timeUntilNext: "",
    loading: true,
    error: null,
  });

  const handleError = (message: string, error?: unknown) => {
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
      if (!res.ok) throw new Error(`Failed to fetch prayer times. Status: ${res.status}`);
      const data = await res.json();
      
      console.log("Full response from prayer times API:", data); // Log the whole response

      // The API can return a 200 OK but with an error in the body.
      if (!data || data.code !== 200 || !data.data || !data.data.timings) {
        console.error("Prayer times API returned a successful status but the data is invalid or indicates an error.", data);
        throw new Error(data.data?.toString() || "Invalid data structure from prayer times API.");
      }
      
      const { schedule, current, next } = calculateSchedule(settings, data.data.timings);
      
      return { schedule, current, next };
    } catch (err) {
      handleError("Could not calculate the full schedule.", err);
      return null;
    }
  }, []);

  // This function is now the single source of truth for updating state from the server response.
  const processServerResponse = useCallback(async (settings: UserSettings) => {
    // === DOWNTIME MODE LOGIC ===
    if (settings.mode === 'downtime') {
      const downtimeState = settings.downtime || {};
      const activityName = downtimeState.currentActivity || "Starting...";
      const startTime = downtimeState.activityStartTime ? new Date(downtimeState.activityStartTime) : new Date();
      const duration = activityName === "Grip Strength Training" ? 1 : 30;
      const endTime = new Date(startTime.getTime() + duration * 60000);

      const downtimeActivity: ScheduleItem = {
        name: activityName,
        description: downtimeState.lastNotifiedActivity || "Downtime activity in progress.",
        startTime: startTime,
        endTime: endTime,
        isPrayer: false,
      };

      const staticDowntimeSchedule: ScheduleItem[] = [
        { name: "Quran Reading", description: "30-minute session", startTime: new Date(), endTime: new Date(), isPrayer: false },
        { name: "LeetCode Session", description: "30-minute session", startTime: new Date(), endTime: new Date(), isPrayer: false },
        { name: "Grip Strength Training", description: "1-minute set every 5 minutes", startTime: new Date(), endTime: new Date(), isPrayer: false },
      ];
      
      setViewState(prev => ({
        ...prev,
        settings,
        schedule: staticDowntimeSchedule,
        currentActivity: downtimeActivity,
        nextActivity: { name: "Next Session", description: "Another session will follow.", startTime: endTime, endTime: endTime, isPrayer: false },
        timeUntilNext: formatTimeUntil(endTime),
        loading: false,
        error: null,
      }));
      return;
    }
    
    // === STRICT MODE LOGIC ===
    const scheduleData = await fetchFullSchedule(settings);

    if (!scheduleData) {
      setViewState(prev => ({ ...prev, settings, loading: false, error: "Could not retrieve the prayer schedule. The external API may be down." }));
      return;
    }
    
    setViewState(prev => ({
      ...prev,
      settings,
      schedule: scheduleData.schedule,
      currentActivity: scheduleData.current,
      nextActivity: scheduleData.next,
      timeUntilNext: formatTimeUntil(scheduleData.next.startTime),
      loading: false,
      error: null,
    }));
  }, [fetchFullSchedule]);
  
  const syncWithServer = useCallback(async (showLoading = true) => {
    if (showLoading) {
      setViewState(prev => ({ ...prev, loading: true, error: null }));
    }
    try {
      const response = await fetch('/api/settings');
      if (!response.ok) {
        if (response.status === 404) {
          setViewState(prev => ({ ...prev, loading: false, settings: null })); 
        } else { throw new Error(`Server error: ${response.statusText}`); }
        return;
      }
      const settings: UserSettings = await response.json();
      await processServerResponse(settings);
    } catch (e) {
      handleError("Failed to sync with the server.", e);
    }
  }, [processServerResponse]);
  
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

  const updateServer = async (payload: object, optimisticState?: Partial<ViewState>) => {
    let previousState: ViewState | null = null;

    if (optimisticState) {
      // Apply optimistic update immediately
      setViewState(prev => {
        previousState = prev; // Save previous state for potential rollback
        return { ...prev, ...optimisticState, loading: false, error: null };
      });
    } else {
      setViewState(prev => ({ ...prev, loading: true, error: null }));
    }

    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(`Server update failed: ${response.statusText}`);
      
      const data = await response.json();
      if (data.success && data.settings) {
        // Server has confirmed the change, process the canonical response
        await processServerResponse(data.settings);
      } else {
        throw new Error(data.error || "Server response was not successful.");
      }

    } catch (e) {
      // If the update fails, roll back the optimistic change
      if (previousState) {
        setViewState(previousState);
      }
      handleError("Failed to update preferences.", e);
    }
  };

  const toggleDowntimeMode = () => updateServer({ action: "toggle_mode" });

  const handleSetGripEnabled = (isEnabled: boolean) => updateServer({ action: 'toggle_grip_enabled', isEnabled });

  const handleSetMealMode = (mode: MealMode) => updateServer({ action: 'set_meal_mode', mode });

  const handleLogMeal = (mealType: MealMode, description: string) => updateServer({ action: 'add_meal_log', meal: { mealType, description } });

  const handleAddActivity = (activity: Omit<CustomActivity, 'id'>, afterActivityId: string) => {
    if (!viewState.settings) return;
    
    const tempId = `temp-${Date.now()}`;
    const newActivity: CustomActivity = { ...activity, id: tempId };

    // Find where to insert the new activity
    const targetIndex = viewState.settings.schedule.findIndex(act => act.id === afterActivityId);
    if (targetIndex === -1) {
      handleError("Could not find where to add the new activity.");
      return;
    }
    
    // Create the new schedule for the optimistic update
    const newScheduleConfig = [...viewState.settings.schedule];
    newScheduleConfig.splice(targetIndex + 1, 0, newActivity);
    
    const newSettings: UserSettings = { ...viewState.settings, schedule: newScheduleConfig };
    
    // Re-calculate the schedule optimistically on the client
    fetchFullSchedule(newSettings).then(optimisticData => {
      if (optimisticData) {
        const optimisticState: Partial<ViewState> = {
          settings: newSettings,
          schedule: optimisticData.schedule,
          currentActivity: optimisticData.current,
          nextActivity: optimisticData.next,
          timeUntilNext: formatTimeUntil(optimisticData.next.startTime),
        };
        // Call updateServer with the real payload and the state to apply optimistically
        updateServer({ action: 'add_activity', activity, afterActivityId }, optimisticState);
      } else {
        // Fallback to non-optimistic update if client-side calculation fails
        updateServer({ action: 'add_activity', activity, afterActivityId });
      }
    });
  };

  const handleRemoveActivity = (activityId: string) => {
    updateServer({ action: 'remove_activity', activityId });
  };

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
    setViewState({ settings: null, schedule: null, currentActivity: null, nextActivity: null, timeUntilNext: '', loading: true, error: null });
    // We can also ask the server to delete the settings
    await fetch("/api/settings", { method: "DELETE" }); // Implement DELETE on the server
    window.location.reload();
  };

  const formatTimeUntil = (targetTime: Date): string => {
    if (!targetTime) return "";
    const diff = targetTime.getTime() - new Date().getTime();
    if (diff < 0) return "Now";
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return hours > 0 ? `${hours}h ${minutes}m` : (minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`);
  };

  if (viewState.loading && !viewState.settings) return <LoadingState />;
  if (!viewState.settings) return <LocationPrompt requestLocation={requestLocation} error={viewState.error || ""} />;
  if (viewState.error) return (
    <main className="flex items-center justify-center min-h-screen w-full">
      <div className="text-center text-red-500">
        <h1 className="text-2xl font-bold">An Error Occurred</h1>
        <p>{viewState.error}</p>
        <Button onClick={() => syncWithServer()} className="mt-4">Try Again</Button>
      </div>
    </main>
  );
  if (!viewState.currentActivity) return <LoadingState message="Calculating Schedule..." />;

  return (
    <main className="flex flex-col items-center justify-start min-h-screen w-full p-4">
      <div className="w-full max-w-2xl">
        <MainCard
          downtimeMode={viewState.settings.mode === 'downtime'}
          gripStrengthEnabled={viewState.settings.downtime?.gripStrengthEnabled ?? true}
          handleSetGripEnabled={handleSetGripEnabled}
          currentActivity={viewState.currentActivity}
          nextActivity={viewState.nextActivity?.name || "..."}
          timeUntilNext={viewState.timeUntilNext}
          mealMode={viewState.settings.mealMode}
          handleSetMealMode={handleSetMealMode}
          handleLogMeal={handleLogMeal}
        />
        <ScheduleView
          downtimeMode={viewState.settings.mode === 'downtime'}
          resetLocation={resetLocation}
          toggleDowntimeMode={toggleDowntimeMode}
          schedule={viewState.schedule || []}
          city={viewState.settings.city || "Unknown"}
          onAddActivity={handleAddActivity}
          onRemoveActivity={handleRemoveActivity}
        />
      </div>
    </main>
  );
} 