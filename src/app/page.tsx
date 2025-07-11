"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MapPin, Clock, Check, Hand, Utensils, Weight, ChevronsDown } from "lucide-react";
import { calculateSchedule, ScheduleItem, PrayerTimes, MealMode, addMinutes, parseTime } from "@/lib/schedule-logic";

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
  const [lastGripTime, setLastGripTime] = useState<Date | null>(null);
  const [activityTimer, setActivityTimer] = useState<NodeJS.Timeout | null>(null);
  const [showDowntimeDialog, setShowDowntimeDialog] = useState(false);
  const [pausedActivityTimer, setPausedActivityTimer] = useState<{ activity: DowntimeActivity; remainingTime: number } | null>(null);
  const [mealMode, setMealMode] = useState<MealMode>("maintenance");

  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  const updateServerState = async (payload: object) => {
    try { await fetch("/api/update-state", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); }
    catch (e) { console.error("Failed to update server state:", e); }
  };

  useEffect(() => {
    const syncWithServer = async () => {
      const savedLocationJSON = localStorage.getItem("salah-sync-location");
      if (savedLocationJSON) {
        try {
          const savedLocation = JSON.parse(savedLocationJSON); setLocation(savedLocation);
          await fetchPrayerTimes(savedLocation.latitude, savedLocation.longitude);
          const response = await fetch('/api/get-settings');
          if (response.ok) {
            const settings = await response.json();
            setDowntimeMode(settings.mode === 'downtime');
            setMealMode(settings.mealMode || 'maintenance');
            if (settings.downtime) {
              setGripStrengthEnabled(settings.downtime.gripStrengthEnabled);
              setQuranTurn(settings.downtime.quranTurn);
              if(settings.downtime.lastGripTime) setLastGripTime(new Date(settings.downtime.lastGripTime));
            }
          }
        } catch (e) { console.error("Failed to sync with server, resetting.", e); resetLocation(); }
      }
      setLoading(false);
    };
    syncWithServer();
    audioRef.current = new Audio("data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7blmGgU7k9n1unEiBC13yO/eizEIHWq+8+OWT");
  }, []);
  
  const handleSetMealMode = (mode: MealMode) => { setMealMode(mode); localStorage.setItem("salah-sync-meal-mode", mode); updateServerState({ action: 'set_meal_mode', mode }); };
  const handleSetGripEnabled = (isEnabled: boolean) => { setGripStrengthEnabled(isEnabled); updateServerState({ action: 'toggle_grip_enabled', isEnabled }); };
  const toggleDowntimeMode = () => { updateServerState({ action: 'toggle_mode' }); setDowntimeMode(!downtimeMode); };

  useEffect(() => { const timer = setInterval(() => setCurrentTime(new Date()), 1000); return () => clearInterval(timer); }, []);
  
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

  const playNotification = () => { if (audioRef.current) { audioRef.current.play().catch((e) => console.log("Audio play failed:", e)) } };
    
  const isPrayerTime = useCallback(() => {
    if (!prayerTimes || !location?.timezone) return null; const now = new Date(); const tz = location.timezone;
    const PRAYER_DURATIONS = { FAJR: 10, DHUHR: 15, ASR: 10, MAGHRIB: 10, ISHA: 30 };
    const prayers = [
      { name: "Fajr", time: parseTime(prayerTimes.Fajr, tz), duration: PRAYER_DURATIONS.FAJR }, { name: "Dhuhr", time: parseTime(prayerTimes.Dhuhr, tz), duration: PRAYER_DURATIONS.DHUHR },
      { name: "Asr", time: parseTime(prayerTimes.Asr, tz), duration: PRAYER_DURATIONS.ASR }, { name: "Maghrib", time: parseTime(prayerTimes.Maghrib, tz), duration: PRAYER_DURATIONS.MAGHRIB },
      { name: "Isha", time: parseTime(prayerTimes.Isha, tz), duration: PRAYER_DURATIONS.ISHA },
    ];
    for (const p of prayers) { if (now >= p.time && now < addMinutes(p.time, p.duration)) return { name: `${p.name} Prayer`, description: `Time for ${p.name} prayer`, startTime: p.time, endTime: addMinutes(p.time, p.duration) }; }
    return null;
  }, [prayerTimes, location?.timezone]);
  
  useEffect(() => {
    if (!downtimeMode || !gripStrengthEnabled) return;
    const gripInterval = setInterval(() => {
      if (currentDowntimeActivity?.type === 'grip' || isPrayerTime()) return;
      const now = new Date();
      if (!lastGripTime || now.getTime() - lastGripTime.getTime() >= 5 * 60 * 1000) {
        playNotification();
        if (currentDowntimeActivity && downtimeStartTime && activityTimer) {
          clearTimeout(activityTimer); setActivityTimer(null);
          const elapsed = now.getTime() - downtimeStartTime.getTime();
          const remainingTime = (currentDowntimeActivity.duration * 60 * 1000) - elapsed;
          if(remainingTime > 0) setPausedActivityTimer({ activity: currentDowntimeActivity, remainingTime });
        }
        setCurrentDowntimeActivity({ name: "Grip Strength Training", description: "Time for your grip strength set!", duration: 5, type: "grip" });
        setDowntimeStartTime(now);
      }
    }, 1000);
    return () => clearInterval(gripInterval);
  }, [downtimeMode, gripStrengthEnabled, lastGripTime, currentDowntimeActivity, downtimeStartTime, activityTimer, isPrayerTime]);

  const startActivityTimer = useCallback((durationMinutes: number, onComplete: () => void) => {
    if (activityTimer) clearTimeout(activityTimer);
    const timer = setTimeout(() => { onComplete(); playNotification(); }, durationMinutes * 60000);
    setActivityTimer(timer);
  }, [activityTimer]);

  const completeDowntimeActivity = useCallback(() => {
    const now = new Date(); if (activityTimer) { clearTimeout(activityTimer); setActivityTimer(null); }
    if (currentDowntimeActivity?.type === "grip") {
        setLastGripTime(now); localStorage.setItem("salah-sync-last-grip-time", now.toISOString());
        updateServerState({ action: 'complete_grip' });
        if (pausedActivityTimer) {
            setCurrentDowntimeActivity(pausedActivityTimer.activity);
            const resumeStartTime = new Date(now.getTime() - (pausedActivityTimer.activity.duration * 60000 - pausedActivityTimer.remainingTime));
            setDowntimeStartTime(resumeStartTime);
            startActivityTimer(pausedActivityTimer.remainingTime / 60000, completeDowntimeActivity);
            setPausedActivityTimer(null);
        } else { setCurrentDowntimeActivity(null); }
    } else { 
        const newQuranTurn = !quranTurn; setQuranTurn(newQuranTurn);
        localStorage.setItem("salah-sync-quran-turn", newQuranTurn.toString());
        setCurrentDowntimeActivity(null); 
    }
  }, [activityTimer, currentDowntimeActivity, pausedActivityTimer, quranTurn, startActivityTimer]);

  const handleDowntimeMode = useCallback(() => {
    const now = new Date(); const prayer = isPrayerTime();
    if (prayer) { setCurrentActivity(prayer); setNextActivity(""); setTimeUntilNext(""); return; }

    if (currentDowntimeActivity?.type === 'grip') {
        if (!downtimeStartTime) return;
        setCurrentActivity({ name: currentDowntimeActivity.name, description: currentDowntimeActivity.description, startTime: downtimeStartTime, endTime: addMinutes(downtimeStartTime, 5)});
        setNextActivity(pausedActivityTimer ? `Resume: ${pausedActivityTimer.activity.name}` : "Next Session");
        setTimeUntilNext(""); return;
    }
    if (!currentDowntimeActivity) {
        const activity: DowntimeActivity = { name: quranTurn ? "Quran Reading" : "LeetCode Session", description: quranTurn ? "Read and reflect on the Quran (30 min)" : "Practice coding problems (30 min)", duration: 30, type: quranTurn ? "quran" : "leetcode" };
        setCurrentDowntimeActivity(activity); setDowntimeStartTime(now);
        startActivityTimer(30, completeDowntimeActivity);
    }
    if (currentDowntimeActivity && downtimeStartTime) {
        setCurrentActivity({ name: currentDowntimeActivity.name, description: currentDowntimeActivity.description, startTime: downtimeStartTime, endTime: addMinutes(downtimeStartTime, currentDowntimeActivity.duration) });
        const nextName = quranTurn ? "LeetCode Session" : "Quran Reading";
        const remaining = formatDowntimeTimeUntil(downtimeStartTime, currentDowntimeActivity.duration);
        setNextActivity(nextName); setTimeUntilNext(`in ${remaining}`);
    }
  }, [isPrayerTime, currentDowntimeActivity, downtimeStartTime, quranTurn, startActivityTimer, completeDowntimeActivity, pausedActivityTimer, formatDowntimeTimeUntil]);

  useEffect(() => {
    if (!loading && prayerTimes && location?.timezone) {
      if (downtimeMode) { handleDowntimeMode(); } 
      else { const { current, next } = calculateSchedule(prayerTimes, location.timezone, mealMode); setCurrentActivity(current); setNextActivity(next.name); setTimeUntilNext(formatTimeUntil(next.startTime)); }
    }
  }, [prayerTimes, currentTime, downtimeMode, handleDowntimeMode, location, mealMode, loading]);

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
      await fetchPrayerTimes(latitude, longitude);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Unable to get your location.";
      setError(errorMessage); setLoading(false);
    }
  };

  const fetchPrayerTimes = async (lat: number, lon: number) => {
    setLoading(true);
    try {
      const today = new Date(); const url = `https://api.aladhan.com/v1/timings/${today.getDate()}-${today.getMonth() + 1}-${today.getFullYear()}?latitude=${lat}&longitude=${lon}&method=2`;
      const res = await fetch(url); if (!res.ok) throw new Error(`Failed to fetch prayer times: ${res.status}`);
      const data = await res.json(); if (data.data && data.data.timings) { setPrayerTimes(data.data.timings); } 
      else { throw new Error("Invalid prayer times data received"); }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to fetch prayer times.";
      setError(errorMessage);
    } finally { setLoading(false); }
  };

  const resetLocation = () => { localStorage.clear(); setLocation(null); setPrayerTimes(null); setError(""); setLoading(false); window.location.reload(); };
  
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
            <div className="mt-6"><Button onClick={completeDowntimeActivity} className="bg-white hover:bg-gray-200 text-black" size="lg"><Check className="h-5 w-5 mr-2" /> Completed Set</Button></div>
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
              <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => {toggleDowntimeMode(); setShowDowntimeDialog(false);}} className="bg-black hover:bg-gray-800 text-white">{downtimeMode ? "Exit Downtime" : "Enter Downtime"}</AlertDialogAction></AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
}
