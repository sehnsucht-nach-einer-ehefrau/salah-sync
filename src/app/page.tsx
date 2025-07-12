"use client";

import { useState, useEffect, useCallback } from "react";
import { ScheduleItem, MealMode, UserSettings, CustomActivity } from "@/lib/types";
import { LocationPrompt } from "@/components/LocationPrompt";
import { LoadingState } from "@/components/LoadingState";
import { ScheduleView } from "@/components/ScheduleView";
import { calculateSchedule } from "@/lib/schedule-logic";
import { MealEntryDialog } from "@/components/MealEntryDialog";

interface ViewState {
  settings: UserSettings | null;
  schedule: ScheduleItem[] | null;
  currentActivity: ScheduleItem | null;
  nextActivity: ScheduleItem | null;
  timeUntilNext: string;
  loading: boolean;
  error: string | null;
  isMealDialogOpen: boolean;
  selectedMealType: MealMode | null;
  isScheduleVisible: boolean;
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
    isMealDialogOpen: false,
    selectedMealType: null,
    isScheduleVisible: false,
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
  
  const syncWithServer = useCallback(async (showLoading = true) => {
    if (showLoading) {
      setViewState(prev => ({ ...prev, loading: true, error: null }));
    }
  
    try {
      const response = await fetch('/api/settings');
      if (!response.ok) {
        if (response.status === 404) {
          setViewState(prev => ({ ...prev, loading: false, settings: null })); 
        } else {
          throw new Error(`Server error: ${response.statusText}`);
        }
        return;
      }
  
      const settings: UserSettings = await response.json();

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
        
        setViewState({
          settings,
          schedule: staticDowntimeSchedule,
          currentActivity: downtimeActivity,
          nextActivity: { name: "Next Session", description: "Another session will follow.", startTime: endTime, endTime: endTime, isPrayer: false },
          timeUntilNext: formatTimeUntil(endTime),
          loading: false,
          error: null,
          isMealDialogOpen: false,
          selectedMealType: null,
          isScheduleVisible: false,
        });
        return;
      }
      
      // === STRICT MODE LOGIC ===
      const scheduleData = await fetchFullSchedule(settings);

      if (!scheduleData) {
        setViewState(prev => ({ ...prev, settings, loading: false, error: "Could not retrieve the prayer schedule. The external API may be down." }));
        return;
      }
      
      setViewState({
        settings,
        schedule: scheduleData.schedule,
        currentActivity: scheduleData.current,
        nextActivity: scheduleData.next,
        timeUntilNext: formatTimeUntil(scheduleData.next.startTime),
        loading: false,
        error: null,
        isMealDialogOpen: false,
        selectedMealType: null,
        isScheduleVisible: false,
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

  const handleLogMeal = async (description: string) => {
    if (!viewState.selectedMealType) return;
    await updateServer({
      action: 'add_meal_log',
      meal: {
        mealType: viewState.selectedMealType,
        description,
      },
    });
  };

  const handleAddActivity = async (activity: Omit<CustomActivity, 'id'>, afterActivityId: string) => {
    if (!viewState.settings || !viewState.schedule) return;

    const newActivity: CustomActivity = { ...activity, id: `temp-${Date.now()}` }; // Temporary ID for UI
    const targetIndex = viewState.settings.schedule.findIndex(act => act.id === afterActivityId);
    if (targetIndex === -1) return;

    const newSchedule = [...viewState.settings.schedule];
    newSchedule.splice(targetIndex + 1, 0, newActivity);
    
    const previousState = viewState;
    setViewState(prev => ({ ...prev, settings: { ...prev.settings!, schedule: newSchedule } }));

    try {
      await updateServer({ action: 'add_activity', activity, afterActivityId });
    } catch (e) {
      setViewState(previousState); // Revert on error
      handleError("Failed to add activity.", e);
    }
  };

  const handleRemoveActivity = async (activityId: string) => {
    if (!viewState.settings || !viewState.schedule) return;

    const newSchedule = viewState.settings.schedule.filter(act => act.id !== activityId);
    
    const previousState = viewState;
    setViewState(prev => ({ ...prev, settings: { ...prev.settings!, schedule: newSchedule } }));
    
    try {
      await updateServer({ action: 'remove_activity', activityId });
    } catch (e) {
      setViewState(previousState); // Revert on error
      handleError("Failed to remove activity.", e);
    }
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
    setViewState({ loading: true, error: null, settings: null, schedule: null, currentActivity: null, nextActivity: null, timeUntilNext: '', isMealDialogOpen: false, selectedMealType: null, isScheduleVisible: false });
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
  
  // If there's an error, show it, but still provide access to core functions if settings are available
  if (viewState.error && !viewState.schedule) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <h2 className="text-2xl font-bold mb-4">Error: {viewState.error}</h2>
        <p className="text-lg mb-4">Please try again later or reset your location.</p>
        <button onClick={resetLocation} className="p-2 bg-red-500 text-white rounded-md">
          Reset Location
        </button>
      </div>
    );
  }

  if (!viewState.currentActivity) return <LoadingState message="Calculating Schedule..." description="Building your optimized daily routine..." />;

  // A new main view component to hold the main card and the schedule button
  const MainView = () => {
    if (!viewState.settings || !viewState.currentActivity) {
      return <LoadingState message="Finalizing view..." />;
    }

    return (
      <div className="relative w-full h-full">
        {/* This is a placeholder for the main content card. ScheduleView will be adapted or replaced */}
        <div className="p-4">
          {/* Main Content Card Here, for now just a button to toggle schedule */}
          <button 
            onClick={() => setViewState(prev => ({ ...prev, isScheduleVisible: !prev.isScheduleVisible }))}
            className="p-2 bg-blue-500 text-white rounded-md"
          >
            {viewState.isScheduleVisible ? 'Hide' : 'Show'} Schedule
          </button>
        </div>

        <ScheduleView
          isVisible={viewState.isScheduleVisible}
          downtimeMode={viewState.settings.mode === 'downtime'}
          resetLocation={resetLocation}
          toggleDowntimeMode={toggleDowntimeMode}
          schedule={viewState.schedule || []}
          city={viewState.settings.city || "Unknown"}
          onAddActivity={handleAddActivity}
          onRemoveActivity={handleRemoveActivity}
        />

        <MealEntryDialog
          isOpen={viewState.isMealDialogOpen}
          onClose={() => setViewState(prev => ({ ...prev, isMealDialogOpen: false, selectedMealType: null }))}
          onSubmit={handleLogMeal}
          mealType={viewState.selectedMealType}
        />
      </div>
    );
  }

  return <MainView />;
}
