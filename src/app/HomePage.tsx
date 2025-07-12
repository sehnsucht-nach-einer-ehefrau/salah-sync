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
  
  // New state for local schedule management and UI toggling
  const [showSchedule, setShowSchedule] = useState(true);

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
      const downtime = settings.downtime;

      if (!downtime || !downtime.activities || downtime.activities.length === 0) {
        handleError("Downtime mode is not configured properly.");
        return;
      }

      const currentActivityIndex = downtime.currentActivityIndex ?? 0;
      const current = downtime.activities[currentActivityIndex];
      const startTime = downtime.currentActivityStartTime ? new Date(downtime.currentActivityStartTime) : new Date();
      const endTime = new Date(startTime.getTime() + current.duration * 60000);

      const currentActivity: ScheduleItem = {
        name: current.name,
        description: `Time remaining for ${current.name}`,
        startTime: startTime,
        endTime: endTime,
        isPrayer: false,
        id: `downtime-${downtime.currentActivityIndex}`,
      };

      // The schedule view in downtime mode will show the list of configured downtime activities.
      const downtimeSchedule: ScheduleItem[] = downtime.activities.map((act, index) => ({
        name: act.name,
        description: `${act.duration} minute ${act.type}`,
        startTime: new Date(), // Placeholder, not used for display
        endTime: new Date(),   // Placeholder, not used for display
        isPrayer: false,
        id: `downtime-config-${index}`,
      }));
      
      setViewState(prev => ({
        ...prev,
        settings,
        schedule: downtimeSchedule,
        currentActivity: currentActivity,
        nextActivity: { name: "Downtime", description: "Next activity will start after this.", startTime: endTime, endTime: endTime, isPrayer: false, id: 'downtime-next' },
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

  // --- START SIMPLIFIED SCHEDULE MANAGEMENT ---

  const handleAddActivity = (activity: Omit<CustomActivity, 'id'>, afterActivityId: string) => {
    // The backend will handle adding the activity to the schedule.
    updateServer({ action: 'add_activity', activity, afterActivityId });
  };

  const handleRemoveActivity = (activityId: string) => {
    // The backend will handle removing the activity.
    updateServer({ action: 'remove_activity', activityId });
  };

  const handleReorderActivities = (reorderedActivities: CustomActivity[]) => {
    // The backend will handle reordering.
    // We only need to send the custom activities, as prayers are fixed.
    updateServer({ action: 'update_schedule', schedule: reorderedActivities });
  };

  // --- END SIMPLIFIED SCHEDULE MANAGEMENT ---

  // Effect for managing downtime mode state machine
  useEffect(() => {
    if (viewState.settings?.mode !== 'downtime' || !viewState.settings.downtime) {
      return;
    }

    const downtimeTimer = setInterval(() => {
      const { settings, currentActivity } = viewState;
      if (!settings || !settings.downtime || !currentActivity) return;

      const { downtime } = settings;
      const now = new Date();

      // 1. Check if current activity is finished
      if (currentActivity.endTime && now >= currentActivity.endTime) {
        if (downtime.pausedState) {
          // If a grip session ends, resume the paused activity
          updateServer({ action: 'resume_downtime_activity' });
        } else {
          // Otherwise, move to the next activity in the queue
          updateServer({ action: 'next_downtime_activity' });
        }
        return; // Stop further checks in this cycle
      }

      // 2. Check if it's time for a grip strength interruption
      if (downtime.gripStrengthEnabled && !downtime.pausedState) {
        const lastGrip = downtime.lastGripTime ? new Date(downtime.lastGripTime) : null;
        const fiveMinutes = 5 * 60 * 1000;
        if (!lastGrip || now.getTime() - lastGrip.getTime() >= fiveMinutes) {
          updateServer({ action: 'start_grip_strength' });
        }
      }
    }, 1000); // Run every second

    return () => clearInterval(downtimeTimer);
  }, [viewState.settings, viewState.currentActivity, updateServer]);


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
    <main className={`flex flex-col items-center min-h-screen w-full p-4 ${showSchedule ? 'justify-start' : 'justify-center'}`}>
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
          toggleSchedule={() => setShowSchedule(s => !s)}
        />
        {showSchedule && (
          <ScheduleView
            downtimeMode={viewState.settings.mode === 'downtime'}
            resetLocation={resetLocation}
            toggleDowntimeMode={toggleDowntimeMode}
            schedule={viewState.schedule || []}
            city={viewState.settings.city || "Unknown"}
            onAddActivity={handleAddActivity}
            onRemoveActivity={handleRemoveActivity}
            onReorder={handleReorderActivities} // Pass new reorder handler
          />
        )}
      </div>
    </main>
  );
} 