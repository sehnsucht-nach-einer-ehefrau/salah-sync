"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MapPin, Clock, Check, Hand, Utensils, Weight, ChevronsDown } from "lucide-react";
import { calculateSchedule, ScheduleItem, PrayerTimes, MealMode, addMinutes, UserSettings } from "@/lib/schedule-logic";

interface Location { latitude: number; longitude: number; city: string; timezone?: string; }
interface DowntimeActivity { name: string; description: string; duration: number; type: "grip" | "quran" | "leetcode"; }

export default function SalahSync() {
  const [location, setLocation] = useState<Location | null>(null);
  const [prayerTimes, setPrayerTimes] = useState<PrayerTimes | null>(null);
  const [currentActivity, setCurrentActivity] = useState<ScheduleItem | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [nextActivity, setNextActivity] = useState<string>("");
  const [timeUntilNext, setTimeUntilNext] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  const [downtimeMode, setDowntimeMode] = useState(false);
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

  const syncWithServer = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/get-settings');
      if (!response.ok) {
        if (response.status === 404) {
          console.log("Settings not found, awaiting setup.");
          const savedLocationJSON = localStorage.getItem("salah-sync-location");
          if (savedLocationJSON) setLocation(JSON.parse(savedLocationJSON));
          setLoading(false);
          return;
        }
        throw new Error(`Failed to get settings: ${response.statusText}`);
      }
      
      const settings: UserSettings = await response.json();
      
      if (settings.latitude && settings.longitude && settings.timezone) {
        const loc = { latitude: settings.latitude, longitude: settings.longitude, city: settings.city || 'N/A', timezone: settings.timezone };
        setLocation(loc);
        if (!prayerTimes) await fetchPrayerTimes(loc.latitude, loc.longitude);
      }
      
      setDowntimeMode(settings.mode === 'downtime');
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
    } catch (e) {
      console.error("Failed to sync with server:", e);
      setError(e instanceof Error ? e.message : "Syncing error.");
    } finally {
      setLoading(false);
    }
  }, [prayerTimes, fetchPrayerTimes]);

  useEffect(() => {
    syncWithServer();
    audioRef.current = new Audio("data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7blmGgU7k9n1unEiBC13yO/eizEIHWq+8+OWT");
    
    const syncInterval = setInterval(syncWithServer, 30 * 1000);
    return () => clearInterval(syncInterval);
  }, [syncWithServer]);
  
  useEffect(() => { const timer = setInterval(() => setCurrentTime(new Date()), 1000); return () => clearInterval(timer); }, []);

  const updateServerState = async (payload: object) => {
    try {
      setLoading(true);
      const res = await fetch("/api/update-state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to update server state');
      await syncWithServer();
    } catch (e) {
      console.error("Failed to update server state:", e);
      setError(e instanceof Error ? e.message : "Update failed.");
    } finally {
      setLoading(false);
    }
  };

  const toggleDowntimeMode = async () => {
    await updateServerState({ action: "toggle_mode" });
    setShowDowntimeDialog(false);
  };
  
  const handleSetMealMode = (mode: MealMode) => {
    setMealMode(mode);
    updateServerState({ action: 'set_meal_mode', mode });
  };
  
  const handleSetGripEnabled = (isEnabled: boolean) => {
    setGripStrengthEnabled(isEnabled);
    updateServerState({ action: 'toggle_grip_enabled', isEnabled });
  };
  
  const completeGripSet = async () => {
    if (currentDowntimeActivity?.type === "grip") {
       await updateServerState({ action: 'complete_grip' });
    }
  };
  
  const formatTimeUntil = (targetTime: Date): string => {
    const now = new Date(); let diff = targetTime.getTime() - now.getTime();
    if (diff < 0) diff += 24 * 60 * 60 * 1000; if (diff <= 0) return "";
    const hours = Math.floor(diff / 3600000); const minutes = Math.floor((diff % 3600000) / 60000);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  };

  const formatDowntimeTimeUntil = useCallback((startTime: Date, duration: number): string => {
      const now = new Date(); const endTime = addMinutes(startTime, duration); const diff = endTime.getTime() - now.getTime();
      if (diff <= 0) return ""; const minutes = Math.floor(diff / 60000); const seconds = Math.floor((diff % 60000) / 1000);
      return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
    }, []);

  useEffect(() => {
    if (loading) return;

    if (downtimeMode) {
        if (currentDowntimeActivity && downtimeStartTime) {
            const description = currentDowntimeActivity.type === 'grip' 
                ? "Time for your 5-minute grip set!" 
                : currentDowntimeActivity.description;
            
            setCurrentActivity({ 
                name: currentDowntimeActivity.name, 
                description: description, 
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
            setCurrentActivity({ name: "Downtime", description: "Waiting for server to assign activity...", startTime: new Date(), endTime: new Date() });
            setNextActivity("");
            setTimeUntilNext("");
        }
    } else if (prayerTimes && location?.timezone) {
        const { current, next } = calculateSchedule(prayerTimes, location.timezone, mealMode);
        setCurrentActivity(current);
        setNextActivity(next.name);
        setTimeUntilNext(formatTimeUntil(next.startTime));
    }
  }, [currentTime, downtimeMode, currentDowntimeActivity, downtimeStartTime, prayerTimes, location, mealMode, loading, quranTurn, formatDowntimeTimeUntil]);

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
      setLocation({ latitude, longitude, city, timezone });
      localStorage.setItem("salah-sync-location", JSON.stringify({latitude, longitude, city, timezone}));
      await fetch('/api/setup-location', { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(initialSettings) });
      await syncWithServer();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Unable to get your location.";
      setError(errorMessage); setLoading(false);
    }
  };

  const resetLocation = () => { localStorage.clear(); setLocation(null); setPrayerTimes(null); setError(""); setLoading(true); window.location.reload(); };
  
  if (loading) { return ( <div className="min-h-screen bg-white flex items-center justify-center"><Card className="p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black"></div></Card></div> ); }
  if (!location) { return ( <div className="min-h-screen bg-white flex items-center justify-center p-4"><Card className="p-8 bg-white border border-gray-200 text-center max-w-md shadow-lg"><MapPin className="h-12 w-12 text-black mx-auto mb-4" /><h2 className="text-2xl font-bold text-black mb-4">Performance Islam</h2><p className="text-gray-600 mb-6">To build your dynamic schedule, we need your location for accurate prayer times.</p>{error && <p className="text-red-500 mb-4 text-sm">{error}</p>}<Button onClick={requestLocation} className="w-full bg-black hover:bg-gray-800 text-white"><MapPin className="h-4 w-4 mr-2" /> Get My Location</Button></Card></div> ); }
  if (!currentActivity) { return ( <div className="min-h-screen bg-white flex items-center justify-center p-4"><Card className="p-8 bg-white border border-gray-200 text-center shadow-lg"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black mx-auto mb-4"></div><h2 className="text-xl font-semibold text-black mb-2">Calculating Schedule</h2><p className="text-gray-600">Building your optimized daily routine...</p></Card></div> ); }

  return (
    <div className={`min-h-screen flex items-center justify-center p-4 transition-all duration-700 ease-in-out ${downtimeMode ? "bg-black" : "bg-white"}`}>
      <div className="text-center max-w-2xl w-full">
        <Card className={`relative p-8 sm:p-12 border mb-4 shadow-lg transition-all duration-700 ease-in-out ${downtimeMode ? "bg-black border-gray-800 text-white" : "bg-white border-gray-200 text-black"}`}>
          {downtimeMode && (
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild><Button onClick={() => handleSetGripEnabled(!gripStrengthEnabled)} variant="ghost" size="icon" className="absolute top-3 right-3 h-8 w-8 rounded-full hover:bg-white/10"><Hand className={`h-5 w-5 transition-colors ${gripStrengthEnabled ? "text-white" : "text-gray-600"}`} /></Button></TooltipTrigger>
                <TooltipContent className="bg-black text-white border-gray-700"><p>Grip Training: {gripStrengthEnabled ? "ON" : "OFF"}</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          <h1 className="text-4xl md:text-6xl font-bold mb-2">{currentActivity.name}</h1>
          <p className={`text-xl md:text-2xl mb-4 ${downtimeMode ? "text-gray-300" : "text-gray-600"}`}>{currentActivity.description}</p>
          
          {downtimeMode && currentDowntimeActivity?.type === "grip" && (
            <div className="mt-6"><Button onClick={completeGripSet} className="bg-white hover:bg-gray-200 text-black" size="lg"><Check className="h-5 w-5 mr-2" /> Completed Set</Button></div>
          )}

          {nextActivity && timeUntilNext && (
            <div className={`flex items-center justify-center text-lg mt-4 ${downtimeMode ? "text-gray-400" : "text-gray-500"}`}>
              <Clock className="h-5 w-5 mr-2 mb-1" />
              <span>Next: {nextActivity} {timeUntilNext}</span>
            </div>
          )}
        </Card>

        {!downtimeMode && (
          <div className="mb-4 flex justify-center gap-2">
            <Button variant={mealMode === 'cutting' ? 'default' : 'outline'} onClick={() => handleSetMealMode('cutting')} className="gap-2"><ChevronsDown size={16}/>Cutting</Button>
            <Button variant={mealMode === 'maintenance' ? 'default' : 'outline'} onClick={() => handleSetMealMode('maintenance')} className="gap-2"><Weight size={16}/>Maintenance</Button>
            <Button variant={mealMode === 'bulking' ? 'default' : 'outline'} onClick={() => handleSetMealMode('bulking')} className="gap-2"><Utensils size={16}/>Bulking</Button>
          </div>
        )}
        
        <div className={`flex items-center justify-center text-md gap-4 transition-all duration-700 ${downtimeMode ? "text-gray-400" : "text-gray-500"}`}>
          <button onClick={resetLocation} className="flex items-center hover:opacity-70 transition-opacity"><MapPin className="h-4 w-4 mr-1 flex-shrink-0" /><span className="truncate">{location.city}</span></button>
          <span>•</span>
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild><span className="font-mono min-w-[70px] text-center">{currentTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}</span></TooltipTrigger>
              <TooltipContent className="bg-black text-white border-gray-700"><p>{currentTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true })}</p></TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <span>•</span>
          <AlertDialog open={showDowntimeDialog} onOpenChange={setShowDowntimeDialog}>
            <AlertDialogTrigger asChild><button className="hover:opacity-70 transition-opacity">{downtimeMode ? "Exit" : "Downtime"}</button></AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader><AlertDialogTitle className="text-2xl">{downtimeMode ? "Exit Downtime Mode?" : "Enter Downtime Mode?"}</AlertDialogTitle><AlertDialogDescription className="text-base">{downtimeMode ? "This will return to your strict, testosterone-optimized schedule." : "This will switch to server-managed Quran/LeetCode sessions with grip training notifications."}</AlertDialogDescription></AlertDialogHeader>
              <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={toggleDowntimeMode} className="bg-black hover:bg-gray-800 text-white">{downtimeMode ? "Exit Downtime" : "Enter Downtime"}</AlertDialogAction></AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
}
