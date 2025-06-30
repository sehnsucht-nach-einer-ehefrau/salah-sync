"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { MapPin, Clock, RefreshCw, Check, Hand } from "lucide-react";

interface PrayerTimes {
  Fajr: string; Dhuhr: string; Asr: string; Maghrib: string; Isha: string;
}
interface Location {
  latitude: number; longitude: number; city: string; timezone?: string;
}
interface ScheduleItem {
  name: string; description: string; startTime: Date; endTime: Date;
}
interface DowntimeActivity {
  name: string; description: string; duration: number; type: "grip" | "quran" | "leetcode";
}

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

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastNotifiedActivityRef = useRef<string>("");

  const saveLocationForCron = async (locationData: Location) => {
    try {
      await fetch("/api/setup-location", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(locationData) });
    } catch (error) { console.error("Failed to save location for cron:", error) }
  };

  useEffect(() => {
    const savedLocation = localStorage.getItem("salah-sync-location");
    const savedGripEnabled = localStorage.getItem("salah-sync-grip-enabled");
    const savedDowntimeMode = localStorage.getItem("salah-sync-downtime-mode");
    const savedLastGripTime = localStorage.getItem("salah-sync-last-grip-time");
    const savedQuranTurn = localStorage.getItem("salah-sync-quran-turn");
    if (savedLocation) {
      try { const loc = JSON.parse(savedLocation); setLocation(loc); fetchPrayerTimes(loc.latitude, loc.longitude) }
      catch (err) { console.error("Error parsing saved location:", err); localStorage.removeItem("salah-sync-location"); setLoading(false) }
    } else { setLoading(false) }
    if (savedGripEnabled !== null) setGripStrengthEnabled(savedGripEnabled === "true");
    if (savedDowntimeMode === "true") setDowntimeMode(true);
    if (savedLastGripTime) setLastGripTime(new Date(savedLastGripTime));
    if (savedQuranTurn !== null) setQuranTurn(savedQuranTurn === "true");
    audioRef.current = new Audio("data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7blmGgU7k9n1unEiBC13yO/eizEIHWq+8+OWT");
  }, []);

  const sendTelegramNotification = useCallback(async (message: string) => {
    try {
      const messageIdentifier = message.split('\n')[0];
      if (lastNotifiedActivityRef.current === messageIdentifier) return;
      lastNotifiedActivityRef.current = messageIdentifier;
      await fetch("/api/telegram", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message }) });
    } catch (error) { console.error("Failed to send Telegram notification:", error) }
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const parseTime = (timeString: string): Date => {
    const [hours, minutes] = timeString.split(":").map(Number);
    const date = new Date(); date.setHours(hours, minutes, 0, 0);
    return date;
  };
  const addMinutes = (date: Date, minutes: number): Date => new Date(date.getTime() + minutes * 60000);
  const subtractMinutes = (date: Date, minutes: number): Date => new Date(date.getTime() - minutes * 60000);

  // --- THIS IS THE FIX ---
  // Re-added the missing formatTimeUntil function
  const formatTimeUntil = useCallback((targetTime: Date): string => {
    const now = new Date();
    let diff = targetTime.getTime() - now.getTime();
    if (diff < 0) diff += 24 * 60 * 60 * 1000;
    if (diff <= 0) return "";
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  }, []);

  const formatDowntimeTimeUntil = useCallback((startTime: Date, duration: number): string => {
      const now = new Date();
      const endTime = addMinutes(startTime, duration);
      const diff = endTime.getTime() - now.getTime();
      if (diff <= 0) return "";
      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
    }, []);

  const playNotification = () => {
    if (audioRef.current) { audioRef.current.play().catch((e) => console.log("Audio play failed:", e)) }
  };
    
  const isPrayerTime = useCallback(() => {
    if (!prayerTimes) return null;
    const now = new Date();
    const prayers = [
      { name: "Fajr", time: parseTime(prayerTimes.Fajr), duration: 10 },
      { name: "Dhuhr", time: parseTime(prayerTimes.Dhuhr), duration: 15 },
      { name: "Asr", time: parseTime(prayerTimes.Asr), duration: 10 },
      { name: "Maghrib", time: parseTime(prayerTimes.Maghrib), duration: 10 },
      { name: "Isha", time: parseTime(prayerTimes.Isha), duration: 30 },
    ];
    for (const p of prayers) {
      if (now >= p.time && now < addMinutes(p.time, p.duration)) {
        return { name: `${p.name} Prayer`, description: `Time for ${p.name} prayer`, startTime: p.time, endTime: addMinutes(p.time, p.duration) };
      }
    }
    return null;
  }, [prayerTimes]);
  
  useEffect(() => {
    if (!downtimeMode || !gripStrengthEnabled) {
      return;
    }
    const gripInterval = setInterval(() => {
      if (currentDowntimeActivity?.type === 'grip' || isPrayerTime()) {
        return;
      }
      const now = new Date();
      if (!lastGripTime || now.getTime() - lastGripTime.getTime() >= 5 * 60 * 1000) {
        sendTelegramNotification("💪 Time for your 5-minute Grip Strength set!");
        playNotification();
        if (currentDowntimeActivity && downtimeStartTime && activityTimer) {
          clearTimeout(activityTimer);
          setActivityTimer(null);
          const elapsed = now.getTime() - downtimeStartTime.getTime();
          const remainingTime = (currentDowntimeActivity.duration * 60 * 1000) - elapsed;
          if(remainingTime > 0) {
            setPausedActivityTimer({ activity: currentDowntimeActivity, remainingTime });
          }
        }
        setCurrentDowntimeActivity({ name: "Grip Strength Training", description: "Time for your grip strength set!", duration: 5, type: "grip" });
        setDowntimeStartTime(now);
        setLastGripTime(now);
        localStorage.setItem("salah-sync-last-grip-time", now.toISOString());
      }
    }, 60000);
    return () => clearInterval(gripInterval);
  }, [downtimeMode, gripStrengthEnabled, lastGripTime, currentDowntimeActivity, downtimeStartTime, activityTimer, sendTelegramNotification, isPrayerTime]);

  const calculateStrictSchedule = useCallback(() => {
    if (!prayerTimes) return;

    const DURATION = {
      TAHAJJUD: 30, EAT_QURAN: 30, FAJR: 10, WORKOUT: 60, SHOWER: 5, LEETCODE: 120,
      BOOTDEV: 60, NAFL: 15, DHUHR: 15, ASR: 10, MAGHRIB: 10, EAT_DINNER: 30,
      WIND_DOWN: 30, WRITING: 30, ISHA: 30,
    };
    const now = new Date();
    const fajrTime = parseTime(prayerTimes.Fajr), dhuhrTime = parseTime(prayerTimes.Dhuhr),
          asrTime = parseTime(prayerTimes.Asr), maghribTime = parseTime(prayerTimes.Maghrib),
          ishaTime = parseTime(prayerTimes.Isha);
    const ishaEnd = addMinutes(ishaTime, DURATION.ISHA);
    const tahajjudStartReference = subtractMinutes(fajrTime, 60);
    let nightSleepMillis = tahajjudStartReference.getTime() - ishaEnd.getTime();
    if (nightSleepMillis < 0) nightSleepMillis += 24 * 60 * 60 * 1000;
    const nightSleepMinutes = nightSleepMillis / 60000;
    const full8HoursSleep = nightSleepMinutes >= 480;
    const schedule: ScheduleItem[] = [];
    const ishaStart = ishaTime, ishaEndTime = addMinutes(ishaStart, DURATION.ISHA),
          writingStart = subtractMinutes(ishaStart, DURATION.WRITING),
          windDownStart = subtractMinutes(writingStart, DURATION.WIND_DOWN),
          maghribStart = maghribTime, maghribEnd = addMinutes(maghribStart, DURATION.MAGHRIB),
          eatDinnerStart = maghribEnd, eatDinnerEnd = addMinutes(eatDinnerStart, DURATION.EAT_DINNER),
          asrStart = asrTime, asrEnd = addMinutes(asrStart, DURATION.ASR),
          dhuhrStart = dhuhrTime, dhuhrEnd = addMinutes(dhuhrStart, DURATION.DHUHR),
          fajrStart = fajrTime, fajrEnd = addMinutes(fajrStart, DURATION.FAJR);

    if (full8HoursSleep) {
      const sleepStart = ishaEndTime, wakeUpTime = addMinutes(sleepStart, 480);
      schedule.push({ name: "Sleep", description: "Full 8 hours rest achieved", startTime: sleepStart, endTime: wakeUpTime });
      let ptr = wakeUpTime;
      schedule.push({ name: "Tahajjud", description: "Night prayer (30 min)", startTime: ptr, endTime: (ptr = addMinutes(ptr, DURATION.TAHAJJUD)) });
      schedule.push({ name: "Eat while Quran", description: "Nourish body and soul (30 min)", startTime: ptr, endTime: (ptr = addMinutes(ptr, DURATION.EAT_QURAN)) });
      if ((fajrTime.getTime() - ptr.getTime()) / 60000 >= DURATION.WORKOUT) {
        schedule.push({ name: "Work out", description: "Strengthen your body (1 hour)", startTime: ptr, endTime: (ptr = addMinutes(ptr, DURATION.WORKOUT)) });
        if ((fajrTime.getTime() - ptr.getTime()) / 60000 >= DURATION.SHOWER) {
          schedule.push({ name: "Cold Shower", description: "Refresh and energize (5 min)", startTime: ptr, endTime: (ptr = addMinutes(ptr, DURATION.SHOWER)) });
          if ((fajrTime.getTime() - ptr.getTime()) / 60000 >= DURATION.BOOTDEV) {
            schedule.push({ name: "Boot.dev Session", description: "Learn backend dev (1 hour)", startTime: ptr, endTime: (ptr = addMinutes(ptr, DURATION.BOOTDEV)) });
            if ((fajrTime.getTime() - ptr.getTime()) / 60000 >= DURATION.LEETCODE) {
              schedule.push({ name: "LeetCode Session", description: "Sharpen your skills (2 hours)", startTime: ptr, endTime: (ptr = addMinutes(ptr, DURATION.LEETCODE)) });
            }
          }
        }
      }
      if (ptr < fajrStart) schedule.push({ name: "Personal Projects & Learning", description: "Build and create until Fajr", startTime: ptr, endTime: fajrStart });
      schedule.push({ name: "Fajr Prayer", description: "Dawn prayer (10 min)", startTime: fajrStart, endTime: fajrEnd });
      schedule.push({ name: "Personal Projects & Learning", description: "Build and create until Dhuhr", startTime: fajrEnd, endTime: dhuhrStart });
      schedule.push({ name: "Dhuhr Prayer", description: "Midday prayer (15 min)", startTime: dhuhrStart, endTime: dhuhrEnd });
      const midPointDhuhrAsr = new Date(dhuhrEnd.getTime() + (asrStart.getTime() - dhuhrEnd.getTime()) / 2);
      schedule.push({ name: "Responsibilities", description: "Handle your duties", startTime: dhuhrEnd, endTime: midPointDhuhrAsr });
      const naflEnd = addMinutes(midPointDhuhrAsr, DURATION.NAFL);
      schedule.push({ name: "8 Raka'at Nafl", description: "Voluntary prayer (15 min)", startTime: midPointDhuhrAsr, endTime: naflEnd });
      schedule.push({ name: "Responsibilities", description: "Handle your duties", startTime: naflEnd, endTime: asrStart });
    } else {
      const napMinutes = Math.max(0, 480 - nightSleepMinutes);
      schedule.push({ name: "Sleep", description: `Rest until Tahajjud (${(nightSleepMinutes / 60).toFixed(1)} hours)`, startTime: ishaEndTime, endTime: tahajjudStartReference });
      schedule.push({ name: "Tahajjud", description: "Night prayer (30 min)", startTime: tahajjudStartReference, endTime: addMinutes(tahajjudStartReference, DURATION.TAHAJJUD) });
      schedule.push({ name: "Eat while Quran", description: "Nourish body and soul (30 min)", startTime: addMinutes(tahajjudStartReference, DURATION.TAHAJJUD), endTime: fajrStart });
      schedule.push({ name: "Fajr Prayer", description: "Dawn prayer (10 min)", startTime: fajrStart, endTime: fajrEnd });
      const workoutEnd = addMinutes(fajrEnd, DURATION.WORKOUT), showerEnd = addMinutes(workoutEnd, DURATION.SHOWER), leetcodeEnd = addMinutes(showerEnd, DURATION.LEETCODE),
            bootdevEnd = addMinutes(leetcodeEnd, DURATION.BOOTDEV), nafl1End = addMinutes(bootdevEnd, DURATION.NAFL);
      schedule.push({ name: "Work out", description: "Strengthen your body (1 hour)", startTime: fajrEnd, endTime: workoutEnd });
      schedule.push({ name: "Cold Shower", description: "Refresh and energize (5 min)", startTime: workoutEnd, endTime: showerEnd });
      schedule.push({ name: "LeetCode Session", description: "Sharpen your skills (2 hours)", startTime: showerEnd, endTime: leetcodeEnd });
      schedule.push({ name: "Boot.dev Session", description: "Learn backend dev (1 hour)", startTime: leetcodeEnd, endTime: bootdevEnd });
      schedule.push({ name: "8 Raka'at Nafl", description: "Voluntary prayer (15 min)", startTime: bootdevEnd, endTime: nafl1End });
      schedule.push({ name: "Personal Projects & Learning", description: "Build and create until Dhuhr", startTime: nafl1End, endTime: dhuhrStart });
      schedule.push({ name: "Dhuhr Prayer", description: "Midday prayer (15 min)", startTime: dhuhrStart, endTime: dhuhrEnd });
      const napEnd = addMinutes(dhuhrEnd, napMinutes);
      schedule.push({ name: "Nap", description: `Rest to complete 8h sleep (${(napMinutes / 60).toFixed(1)}h)`, startTime: dhuhrEnd, endTime: napEnd });
      const nafl2End = addMinutes(napEnd, DURATION.NAFL);
      schedule.push({ name: "8 Raka'at Nafl", description: "Voluntary prayer (15 min)", startTime: napEnd, endTime: nafl2End });
      schedule.push({ name: "Responsibilities", description: "Handle your duties until Asr", startTime: nafl2End, endTime: asrStart });
    }
    schedule.push({ name: "Asr Prayer", description: "Afternoon prayer (10 min)", startTime: asrStart, endTime: asrEnd });
    schedule.push({ name: "Responsibilities", description: "Handle duties until Maghrib", startTime: asrEnd, endTime: maghribStart });
    schedule.push({ name: "Maghrib Prayer", description: "Sunset prayer (10 min)", startTime: maghribStart, endTime: maghribEnd });
    schedule.push({ name: "Eat", description: "Evening meal (30 min)", startTime: eatDinnerStart, endTime: eatDinnerEnd });
    schedule.push({ name: "Responsibilities", description: "Handle duties until wind-down", startTime: eatDinnerEnd, endTime: windDownStart });
    schedule.push({ name: "Wind down", description: "Relax and prepare for sleep (30 min)", startTime: windDownStart, endTime: writingStart });
    schedule.push({ name: "Writing", description: "Journal or creative writing (30 min)", startTime: writingStart, endTime: ishaStart });
    schedule.push({ name: "Isha Prayer", description: "Night prayer (30 min)", startTime: ishaStart, endTime: ishaEndTime });

    const sortedSchedule = schedule.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
    let nextIdx = sortedSchedule.findIndex((item) => item.startTime > now);
    if (nextIdx === -1) nextIdx = 0;
    const currIdx = nextIdx === 0 ? sortedSchedule.length - 1 : nextIdx - 1;
    
    setCurrentActivity(sortedSchedule[currIdx]);
    setNextActivity(sortedSchedule[nextIdx].name);
    setTimeUntilNext(formatTimeUntil(sortedSchedule[nextIdx].startTime));
  }, [prayerTimes, formatTimeUntil]);

  const startActivityTimer = useCallback((durationMinutes: number, onComplete: () => void) => {
    if (activityTimer) clearTimeout(activityTimer);
    const timer = setTimeout(() => { onComplete(); playNotification(); }, durationMinutes * 60000);
    setActivityTimer(timer);
  }, [activityTimer]);

  const completeDowntimeActivity = useCallback(() => {
    const now = new Date();
    if (activityTimer) { clearTimeout(activityTimer); setActivityTimer(null); }
    
    if (currentDowntimeActivity?.type === "grip") {
        if (pausedActivityTimer) {
            sendTelegramNotification(`💪 Grip set complete! Resuming ${pausedActivityTimer.activity.name}.`);
            setCurrentDowntimeActivity(pausedActivityTimer.activity);
            const resumeStartTime = new Date(now.getTime() - (pausedActivityTimer.activity.duration * 60000 - pausedActivityTimer.remainingTime));
            setDowntimeStartTime(resumeStartTime);
            startActivityTimer(pausedActivityTimer.remainingTime / 60000, completeDowntimeActivity);
            setPausedActivityTimer(null);
        } else {
            setCurrentDowntimeActivity(null); 
        }
    } else { 
        const newQuranTurn = !quranTurn;
        setQuranTurn(newQuranTurn);
        localStorage.setItem("salah-sync-quran-turn", newQuranTurn.toString());
        
        const nextActivityName = newQuranTurn ? "Quran Reading" : "LeetCode Session";
        sendTelegramNotification(`✅ Session complete! Time for your next 30-minute activity: ${nextActivityName}.`);
        
        setCurrentDowntimeActivity(null); 
    }
  }, [activityTimer, currentDowntimeActivity, pausedActivityTimer, quranTurn, startActivityTimer, sendTelegramNotification]);

  const handleDowntimeMode = useCallback(() => {
    const now = new Date();
    const prayer = isPrayerTime();
    if (prayer) { setCurrentActivity(prayer); setNextActivity(""); setTimeUntilNext(""); return; }

    if (currentDowntimeActivity?.type === 'grip') {
        if (!downtimeStartTime) return;
        setCurrentActivity({ name: currentDowntimeActivity.name, description: currentDowntimeActivity.description, startTime: downtimeStartTime, endTime: addMinutes(downtimeStartTime, 5)});
        setNextActivity(pausedActivityTimer ? `Resume: ${pausedActivityTimer.activity.name}` : "Next Session");
        setTimeUntilNext("");
        return;
    }

    if (!currentDowntimeActivity) {
        const activity: DowntimeActivity = {
          name: quranTurn ? "Quran Reading" : "LeetCode Session",
          description: quranTurn ? "Read and reflect on the Quran (30 min)" : "Practice coding problems (30 min)",
          duration: 30, type: quranTurn ? "quran" : "leetcode",
        };
        setCurrentDowntimeActivity(activity);
        setDowntimeStartTime(now);
        startActivityTimer(30, completeDowntimeActivity);
        sendTelegramNotification(`▶️ Starting 30-minute session: ${activity.name}`);
    }
    
    if (currentDowntimeActivity && downtimeStartTime) {
        setCurrentActivity({
            name: currentDowntimeActivity.name, description: currentDowntimeActivity.description,
            startTime: downtimeStartTime, endTime: addMinutes(downtimeStartTime, currentDowntimeActivity.duration),
        });
        const nextName = quranTurn ? "LeetCode Session" : "Quran Reading";
        const remaining = formatDowntimeTimeUntil(downtimeStartTime, currentDowntimeActivity.duration);
        setNextActivity(nextName);
        setTimeUntilNext(`in ${remaining}`);
    }
  }, [
    isPrayerTime, currentDowntimeActivity, downtimeStartTime, quranTurn, 
    startActivityTimer, completeDowntimeActivity, pausedActivityTimer, sendTelegramNotification, formatDowntimeTimeUntil
  ]);

  useEffect(() => {
    if (prayerTimes && location) {
        if (downtimeMode) {
            handleDowntimeMode();
        } else {
            calculateStrictSchedule();
        }
    }
  }, [prayerTimes, currentTime, downtimeMode, calculateStrictSchedule, handleDowntimeMode, location]);

  const toggleDowntimeMode = () => {
    const newMode = !downtimeMode;
    setDowntimeMode(newMode);
    localStorage.setItem("salah-sync-downtime-mode", newMode.toString());
    lastNotifiedActivityRef.current = "";
    if (!newMode) {
      setCurrentDowntimeActivity(null);
      setDowntimeStartTime(null);
      setPausedActivityTimer(null);
      if (activityTimer) clearTimeout(activityTimer);
      setActivityTimer(null);
    }
  };

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
      const locData = { latitude, longitude, city, timezone };

      setLocation(locData);
      localStorage.setItem("salah-sync-location", JSON.stringify(locData));
      await saveLocationForCron(locData);
      await fetchPrayerTimes(latitude, longitude);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Unable to get your location.";
      setError(errorMessage);
      setLoading(false);
    }
  };

  const fetchPrayerTimes = async (lat: number, lon: number) => {
    setLoading(true);
    try {
      const today = new Date();
      const url = `https://api.aladhan.com/v1/timings/${today.getDate()}-${today.getMonth() + 1}-${today.getFullYear()}?latitude=${lat}&longitude=${lon}&method=2`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch prayer times: ${res.status}`);
      const data = await res.json();
      if (data.data && data.data.timings) { setPrayerTimes(data.data.timings); } 
      else { throw new Error("Invalid prayer times data received"); }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to fetch prayer times.";
      setError(errorMessage);
    } finally { setLoading(false); }
  };

  const resetLocation = () => {
    localStorage.removeItem("salah-sync-location");
    setLocation(null); setPrayerTimes(null); setError(""); setLoading(false);
  };
  
  if (loading || !location || !prayerTimes || !currentActivity) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <Card className="p-8 bg-white border border-gray-200 text-center max-w-md shadow-lg">
          {!location ? (
            <>
              <MapPin className="h-12 w-12 text-black mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-black mb-4">Welcome to Salah Sync</h2>
              <p className="text-gray-600 mb-6">To create your strict daily schedule, we need your location to get accurate prayer times.</p>
              {error && <p className="text-red-500 mb-4 text-sm">{error}</p>}
              <Button onClick={requestLocation} className="w-full bg-black hover:bg-gray-800 text-white" disabled={loading}>
                <MapPin className="h-4 w-4 mr-2" /> Get My Location
              </Button>
            </>
          ) : (
            <>
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black mx-auto mb-4"></div>
              <h2 className="text-xl font-semibold text-black mb-2">{!prayerTimes ? "Loading Prayer Times" : "Calculating Schedule"}</h2>
              <p className="text-gray-600">{!prayerTimes ? `Getting prayer times for ${location.city}...` : "Setting up your daily routine..."}</p>
              {error && (
                <div className="mt-4">
                  <p className="text-red-500 mb-4 text-sm">{error}</p>
                  <Button onClick={() => fetchPrayerTimes(location.latitude, location.longitude)} className="bg-black hover:bg-gray-800 text-white">
                    <RefreshCw className="h-4 w-4 mr-2" /> Retry
                  </Button>
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className={`min-h-screen flex items-center justify-center p-4 transition-all duration-700 ease-in-out ${downtimeMode ? "bg-black" : "bg-white"}`}>
      <div className="text-center max-w-2xl w-full">
        <Card className={`relative p-8 sm:p-12 border mb-6 shadow-lg transition-all duration-700 ease-in-out ${downtimeMode ? "bg-black border-gray-800 text-white" : "bg-white border-gray-200 text-black"}`}>
          {downtimeMode && (
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button onClick={() => setGripStrengthEnabled((e) => !e)} variant="ghost" size="icon" className="absolute top-3 right-3 h-8 w-8 rounded-full hover:bg-white/10">
                    <Hand className={`h-5 w-5 transition-colors ${gripStrengthEnabled ? "text-white" : "text-gray-600"}`} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="bg-black text-white border-gray-700"><p>Grip Training: {gripStrengthEnabled ? "ON" : "OFF"}</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <h1 className="text-4xl md:text-6xl font-bold mb-2">{currentActivity.name}</h1>
          <p className={`text-xl md:text-2xl mb-4 ${downtimeMode ? "text-gray-300" : "text-gray-600"}`}>{currentActivity.description}</p>
          {downtimeMode && currentDowntimeActivity?.type === "grip" && (
            <div className="mt-6">
              <Button onClick={completeDowntimeActivity} className="bg-white hover:bg-gray-200 text-black" size="lg"><Check className="h-5 w-5 mr-2" /> Completed Set</Button>
            </div>
          )}
          {nextActivity && timeUntilNext && (
            <div className={`flex items-center justify-center text-lg mt-4 ${downtimeMode ? "text-gray-400" : "text-gray-500"}`}>
              <Clock className="h-5 w-5 mr-2 mb-1" />
              <span>Next: {nextActivity} {timeUntilNext}</span>
            </div>
          )}
        </Card>
        <div className={`flex items-center justify-center text-md gap-4 transition-all duration-700 ${downtimeMode ? "text-gray-400" : "text-gray-500"}`}>
          <button onClick={resetLocation} className="flex items-center hover:opacity-70 transition-opacity"><MapPin className="h-4 w-4 mr-1 flex-shrink-0 mb-1" /><span className="truncate">{location.city}</span></button>
          <span>•</span>
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="font-mono min-w-[70px] text-center">{currentTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}</span>
              </TooltipTrigger>
              <TooltipContent className="bg-black text-white border-gray-700"><p>{currentTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true })}</p></TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <span>•</span>
          {downtimeMode ? (
            <button onClick={toggleDowntimeMode} className="hover:opacity-70 transition-opacity">Exit</button>
          ) : (
            <AlertDialog open={showDowntimeDialog} onOpenChange={setShowDowntimeDialog}>
              <AlertDialogTrigger asChild><button className="hover:opacity-70 transition-opacity">Downtime</button></AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader><AlertDialogTitle className="text-2xl">Enter Downtime Mode?</AlertDialogTitle><AlertDialogDescription className="text-base">This overrides your strict schedule, switching to alternating Quran and LeetCode sessions with optional grip strength training.</AlertDialogDescription></AlertDialogHeader>
                <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={toggleDowntimeMode} className="bg-black hover:bg-gray-800 text-white">Enter Downtime</AlertDialogAction></AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>
    </div>
  );
}
