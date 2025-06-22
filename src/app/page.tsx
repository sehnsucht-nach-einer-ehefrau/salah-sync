
"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { MapPin, Clock, RefreshCw, Settings, Check } from "lucide-react"

interface PrayerTimes {
  Fajr: string
  Dhuhr: string
  Asr: string
  Maghrib: string
  Isha: string
}

interface Location {
  latitude: number
  longitude: number
  city: string
}

interface ScheduleItem {
  name: string
  description: string
  startTime: Date
  endTime: Date
}

interface DowntimeActivity {
  name: string
  description: string
  duration: number // in minutes
  type: "grip" | "quran" | "leetcode"
}

export default function SalahSync() {
  const [location, setLocation] = useState<Location | null>(null)
  const [prayerTimes, setPrayerTimes] = useState<PrayerTimes | null>(null)
  const [currentActivity, setCurrentActivity] = useState<ScheduleItem | null>(null)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [nextActivity, setNextActivity] = useState<string>("")
  const [timeUntilNext, setTimeUntilNext] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>("")

  // Downtime mode states
  const [downtimeMode, setDowntimeMode] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [gripStrengthEnabled, setGripStrengthEnabled] = useState(true)
  const [currentDowntimeActivity, setCurrentDowntimeActivity] = useState<DowntimeActivity | null>(null)
  const [downtimeStartTime, setDowntimeStartTime] = useState<Date | null>(null)
  const [quranTurn, setQuranTurn] = useState(true)
  const [lastGripTime, setLastGripTime] = useState<Date | null>(null)
  const [activityTimer, setActivityTimer] = useState<NodeJS.Timeout | null>(null)
  const [lastNotifiedActivity, setLastNotifiedActivity] = useState<string>("")

  const audioRef = useRef<HTMLAudioElement | null>(null)

  const saveLocationForCron = async (locationData: Location) => {
    try {
      await fetch("/api/setup-location", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(locationData),
      })
    } catch (error) {
      console.error("Failed to save location for cron:", error)
    }
  }

  // Load saved data from localStorage on mount
  useEffect(() => {
    const savedLocation = localStorage.getItem("salah-sync-location")
    const savedGripEnabled = localStorage.getItem("salah-sync-grip-enabled")
    const savedDowntimeMode = localStorage.getItem("salah-sync-downtime-mode")

    if (savedLocation) {
      try {
        const loc = JSON.parse(savedLocation)
        setLocation(loc)
        fetchPrayerTimes(loc.latitude, loc.longitude)
      } catch (err) {
        console.error("Error parsing saved location:", err)
        localStorage.removeItem("salah-sync-location")
        setLoading(false)
      }
    } else {
      setLoading(false)
    }

    if (savedGripEnabled !== null) {
      setGripStrengthEnabled(savedGripEnabled === "true")
    }

    if (savedDowntimeMode === "true") {
      setDowntimeMode(true)
    }

    // Initialize audio for notifications
    audioRef.current = new Audio(
      "data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7blmGgU7k9n1unEiBC13yO/eizEIHWq+8+OWT",
    )
  }, [])

  // Send notification to Telegram
  const sendTelegramNotification = async (message: string) => {
    try {
      await fetch("/api/telegram", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message }),
      })
    } catch (error) {
      console.error("Failed to send Telegram notification:", error)
    }
  }

  // Update current time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  // Send notification when activity changes
  useEffect(() => {
    if (currentActivity && currentActivity.name !== lastNotifiedActivity) {
      const message = `🕐 ${currentActivity.name}\n${currentActivity.description}`
      sendTelegramNotification(message)
      setLastNotifiedActivity(currentActivity.name)
    }
  }, [currentActivity, lastNotifiedActivity])

  // Calculate current activity when prayer times or current time changes
  useEffect(() => {
    if (prayerTimes && location) {
      if (downtimeMode) {
        handleDowntimeMode()
      } else {
        calculateCurrentActivity()
      }
    }
  }, [prayerTimes, currentTime, downtimeMode])

  // Handle downtime mode logic
  useEffect(() => {
    if (downtimeMode && gripStrengthEnabled) {
      const checkGripTime = () => {
        const now = new Date()
        if (lastGripTime && now.getTime() - lastGripTime.getTime() >= 5 * 60 * 1000) {
          setCurrentDowntimeActivity({
            name: "Grip Strength Training",
            description: "Time for your grip strength set!",
            duration: 5,
            type: "grip",
          })
          playNotification()
        }
      }

      const interval = setInterval(checkGripTime, 1000)
      return () => clearInterval(interval)
    }
  }, [downtimeMode, gripStrengthEnabled, lastGripTime])

  const playNotification = () => {
    if (audioRef.current) {
      audioRef.current.play().catch((e) => console.log("Audio play failed:", e))
    }
  }

  const requestLocation = async () => {
    try {
      setLoading(true)
      setError("")

      if (!navigator.geolocation) {
        throw new Error("Geolocation is not supported by this browser")
      }

      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 300000,
        })
      })

      const { latitude, longitude } = position.coords

      let city = "Unknown City"
      try {
        const response = await fetch(
          `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`,
        )
        if (response.ok) {
          const data = await response.json()
          city = data.city || data.locality || data.principalSubdivision || "Unknown City"
        }
      } catch (err) {
        console.warn("Could not get city name:", err)
      }

      const locationData = { latitude, longitude, city }
      setLocation(locationData)
      localStorage.setItem("salah-sync-location", JSON.stringify(locationData))
      await saveLocationForCron(locationData) // Add this line

      await fetchPrayerTimes(latitude, longitude)
    } catch (err: any) {
      console.error("Location error:", err)
      setError(err.message || "Unable to get your location. Please enable location services.")
      setLoading(false)
    }
  }

  const fetchPrayerTimes = async (latitude: number, longitude: number) => {
    try {
      const today = new Date()
      const url = `https://api.aladhan.com/v1/timings/${today.getDate()}-${today.getMonth() + 1}-${today.getFullYear()}?latitude=${latitude}&longitude=${longitude}&method=2`

      const response = await fetch(url)

      if (!response.ok) {
        throw new Error(`Failed to fetch prayer times: ${response.status}`)
      }

      const data = await response.json()

      if (data.data && data.data.timings) {
        setPrayerTimes(data.data.timings)
        setLoading(false)
      } else {
        throw new Error("Invalid prayer times data received")
      }
    } catch (err: any) {
      console.error("Prayer times error:", err)
      setError("Failed to fetch prayer times. Please try again.")
      setLoading(false)
    }
  }

  const parseTime = (timeString: string): Date => {
    const [hours, minutes] = timeString.split(":").map(Number)
    const date = new Date()
    date.setHours(hours, minutes, 0, 0)
    return date
  }

  const addMinutes = (date: Date, minutes: number): Date => {
    return new Date(date.getTime() + minutes * 60000)
  }

  const subtractMinutes = (date: Date, minutes: number): Date => {
    return new Date(date.getTime() - minutes * 60000)
  }

  const formatTimeUntil = (targetTime: Date): string => {
    const now = new Date()
    let diff = targetTime.getTime() - now.getTime()

    if (diff < 0) {
      diff += 24 * 60 * 60 * 1000
    }

    if (diff <= 0) return ""

    const hours = Math.floor(diff / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

    if (hours > 0) {
      return `${hours}h ${minutes}m`
    }
    return `${minutes}m`
  }

  const isPrayerTime = (now: Date): ScheduleItem | null => {
    if (!prayerTimes) return null

    const fajrTime = parseTime(prayerTimes.Fajr)
    const dhuhrTime = parseTime(prayerTimes.Dhuhr)
    const asrTime = parseTime(prayerTimes.Asr)
    const maghribTime = parseTime(prayerTimes.Maghrib)
    const ishaTime = parseTime(prayerTimes.Isha)

    const prayers = [
      {
        name: "Fajr Prayer",
        description: "Dawn prayer - Start your day with gratitude",
        startTime: fajrTime,
        endTime: addMinutes(fajrTime, 10),
      },
      {
        name: "Dhuhr Prayer",
        description: "Midday prayer - Pause and remember Allah",
        startTime: dhuhrTime,
        endTime: addMinutes(dhuhrTime, 20),
      },
      {
        name: "Asr Prayer",
        description: "Afternoon prayer - Seek Allah's guidance",
        startTime: asrTime,
        endTime: addMinutes(asrTime, 10),
      },
      {
        name: "Maghrib Prayer",
        description: "Sunset prayer - Thank Allah for the day",
        startTime: maghribTime,
        endTime: addMinutes(maghribTime, 10),
      },
      {
        name: "Isha Prayer",
        description: "Night prayer - End your day with worship",
        startTime: ishaTime,
        endTime: addMinutes(ishaTime, 30),
      },
    ]

    for (const prayer of prayers) {
      if (now >= prayer.startTime && now < prayer.endTime) {
        return prayer
      }
    }

    return null
  }

  const startActivityTimer = (duration: number, onComplete: () => void) => {
    if (activityTimer) {
      clearTimeout(activityTimer)
    }

    const timer = setTimeout(
      () => {
        onComplete()
        playNotification()
      },
      duration * 60 * 1000,
    )

    setActivityTimer(timer)
  }

  const handleDowntimeMode = () => {
    const now = new Date()

    // Check if it's prayer time - prayer overrides downtime
    const prayerActivity = isPrayerTime(now)
    if (prayerActivity) {
      setCurrentActivity(prayerActivity)
      if (activityTimer) {
        clearTimeout(activityTimer)
        setActivityTimer(null)
      }
      return
    }

    // If no current downtime activity, start with grip strength or main activity
    if (!currentDowntimeActivity) {
      if (gripStrengthEnabled) {
        setCurrentDowntimeActivity({
          name: "Grip Strength Training",
          description: "Start your downtime with grip strength training",
          duration: 5,
          type: "grip",
        })
        setLastGripTime(now)
      } else {
        const activity = {
          name: quranTurn ? "Quran Reading" : "LeetCode Session",
          description: quranTurn ? "Read and reflect on the Quran (30 min)" : "Practice coding problems (30 min)",
          duration: 30,
          type: quranTurn ? "quran" : "leetcode",
        } as DowntimeActivity

        setCurrentDowntimeActivity(activity)

        // Start 30-minute timer for Quran/LeetCode
        startActivityTimer(30, () => {
          completeDowntimeActivity()
        })
      }
      setDowntimeStartTime(now)
    }

    // Convert downtime activity to schedule item format
    if (currentDowntimeActivity) {
      setCurrentActivity({
        name: currentDowntimeActivity.name,
        description: currentDowntimeActivity.description,
        startTime: downtimeStartTime || now,
        endTime: addMinutes(downtimeStartTime || now, currentDowntimeActivity.duration),
      })
    }
  }

  const completeDowntimeActivity = () => {
    if (!currentDowntimeActivity) return

    const now = new Date()

    if (activityTimer) {
      clearTimeout(activityTimer)
      setActivityTimer(null)
    }

    if (currentDowntimeActivity.type === "grip") {
      setLastGripTime(now)
      // After grip, go to main activity (Quran or LeetCode)
      const activity = {
        name: quranTurn ? "Quran Reading" : "LeetCode Session",
        description: quranTurn ? "Read and reflect on the Quran (30 min)" : "Practice coding problems (30 min)",
        duration: 30,
        type: quranTurn ? "quran" : "leetcode",
      } as DowntimeActivity

      setCurrentDowntimeActivity(activity)

      // Start 30-minute timer
      startActivityTimer(30, () => {
        completeDowntimeActivity()
      })
    } else {
      // After main activity, toggle for next time
      setQuranTurn(!quranTurn)
      if (gripStrengthEnabled) {
        // Wait for next grip strength (will be triggered by timer)
        setCurrentDowntimeActivity({
          name: "Free Time",
          description: "Relax until your next grip strength set (5 min)",
          duration: 5,
          type: "grip",
        })
      } else {
        // Go directly to next main activity
        const activity = {
          name: !quranTurn ? "Quran Reading" : "LeetCode Session",
          description: !quranTurn ? "Read and reflect on the Quran (30 min)" : "Practice coding problems (30 min)",
          duration: 30,
          type: !quranTurn ? "quran" : "leetcode",
        } as DowntimeActivity

        setCurrentDowntimeActivity(activity)

        // Start 30-minute timer
        startActivityTimer(30, () => {
          completeDowntimeActivity()
        })
      }
    }

    setDowntimeStartTime(now)
    playNotification()
  }

  const toggleDowntimeMode = () => {
    const newMode = !downtimeMode
    setDowntimeMode(newMode)
    localStorage.setItem("salah-sync-downtime-mode", newMode.toString())

    if (!newMode) {
      // Exit downtime mode
      setCurrentDowntimeActivity(null)
      setDowntimeStartTime(null)
      if (activityTimer) {
        clearTimeout(activityTimer)
        setActivityTimer(null)
      }
    }
  }

  const toggleGripStrength = (enabled: boolean) => {
    setGripStrengthEnabled(enabled)
    localStorage.setItem("salah-sync-grip-enabled", enabled.toString())
  }

  const calculateCurrentActivity = () => {
    if (!prayerTimes) return

    const now = new Date()
    const fajrTime = parseTime(prayerTimes.Fajr)
    const dhuhrTime = parseTime(prayerTimes.Dhuhr)
    const asrTime = parseTime(prayerTimes.Asr)
    const maghribTime = parseTime(prayerTimes.Maghrib)
    const ishaTime = parseTime(prayerTimes.Isha)

    // Calculate if we need the 8+ hour sleep logic
    const tahajjudNormalTime = subtractMinutes(fajrTime, 60)
    const sleepStartTime = addMinutes(ishaTime, 30)

    let nightSleepMinutes = 0
    if (tahajjudNormalTime.getTime() > sleepStartTime.getTime()) {
      nightSleepMinutes = (tahajjudNormalTime.getTime() - sleepStartTime.getTime()) / (1000 * 60)
    } else {
      const endOfDay = new Date(sleepStartTime)
      endOfDay.setHours(23, 59, 59, 999)
      const startOfNextDay = new Date(tahajjudNormalTime)
      startOfNextDay.setHours(0, 0, 0, 0)
      nightSleepMinutes =
        (endOfDay.getTime() - sleepStartTime.getTime() + (tahajjudNormalTime.getTime() - startOfNextDay.getTime())) /
        (1000 * 60)
    }

    const needsLongSleep = nightSleepMinutes > 480

    let tahajjudStart: Date
    let eatQuranStart: Date
    let workoutStart: Date | null = null

    if (needsLongSleep) {
      tahajjudStart = addMinutes(sleepStartTime, 480)
      eatQuranStart = addMinutes(tahajjudStart, 30)

      const eatQuranEnd = addMinutes(eatQuranStart, 30)
      const timeUntilFajr = (fajrTime.getTime() - eatQuranEnd.getTime()) / (1000 * 60)

      if (timeUntilFajr >= 60) {
        workoutStart = eatQuranEnd
      }
    } else {
      tahajjudStart = tahajjudNormalTime
      eatQuranStart = addMinutes(tahajjudStart, 30)
      workoutStart = addMinutes(eatQuranStart, 30)
    }

    const schedule: ScheduleItem[] = []

    schedule.push({
      name: "Tahajjud",
      description: "Night prayer - Connect with Allah in the blessed hours (30 min)",
      startTime: tahajjudStart,
      endTime: addMinutes(tahajjudStart, 30),
    })

    schedule.push({
      name: "Eat + Quran",
      description: "Nourish your body and soul together (30 min)",
      startTime: eatQuranStart,
      endTime: addMinutes(eatQuranStart, 30),
    })

    if (workoutStart) {
      schedule.push({
        name: "Workout Session",
        description: "Physical training - Strengthen your body (1 hour)",
        startTime: workoutStart,
        endTime: addMinutes(workoutStart, 60),
      })

      const coldShowerStart = addMinutes(workoutStart, 60)
      schedule.push({
        name: "Cold Shower",
        description: "Refresh and energize yourself (5 min)",
        startTime: coldShowerStart,
        endTime: addMinutes(coldShowerStart, 5),
      })

      const leetcodeStart = addMinutes(coldShowerStart, 5)
      schedule.push({
        name: "LeetCode Session",
        description: "Sharpen your problem-solving skills (2 hours)",
        startTime: leetcodeStart,
        endTime: addMinutes(leetcodeStart, 120),
      })

      const bootdevStart = addMinutes(leetcodeStart, 120)
      schedule.push({
        name: "Boot.dev Session",
        description: "Learn backend development (1 hour)",
        startTime: bootdevStart,
        endTime: addMinutes(bootdevStart, 60),
      })

      const naflStart = addMinutes(bootdevStart, 60)
      schedule.push({
        name: "8 Rakat Nafl",
        description: "Voluntary prayer - Spiritual recharge (15 min)",
        startTime: naflStart,
        endTime: addMinutes(naflStart, 15),
      })

      const personalProjectsStart = addMinutes(naflStart, 15)
      schedule.push({
        name: "Personal Projects & Learning",
        description: "Build and create - Apply your knowledge",
        startTime: personalProjectsStart,
        endTime: dhuhrTime,
      })
    }

    schedule.push({
      name: "Fajr Prayer",
      description: "Dawn prayer - Start your day with gratitude (10 min)",
      startTime: fajrTime,
      endTime: addMinutes(fajrTime, 10),
    })

    schedule.push({
      name: "Dhuhr Prayer",
      description: "Midday prayer - Pause and remember Allah (20 min)",
      startTime: dhuhrTime,
      endTime: addMinutes(dhuhrTime, 20),
    })

    if (!needsLongSleep) {
      const napStart = addMinutes(dhuhrTime, 20)
      const napMinutes = Math.max(0, 480 - nightSleepMinutes)
      schedule.push({
        name: "Nap Time",
        description: `Rest and recharge (${Math.round((napMinutes / 60) * 10) / 10} hours for 8h total sleep)`,
        startTime: napStart,
        endTime: addMinutes(napStart, napMinutes),
      })
    }

    schedule.push({
      name: "Asr Prayer",
      description: "Afternoon prayer - Seek Allah's guidance (10 min)",
      startTime: asrTime,
      endTime: addMinutes(asrTime, 10),
    })

    schedule.push({
      name: "Maghrib Prayer",
      description: "Sunset prayer - Thank Allah for the day (10 min)",
      startTime: maghribTime,
      endTime: addMinutes(maghribTime, 10),
    })

    schedule.push({
      name: "Isha Prayer",
      description: "Night prayer - End your day with worship (30 min)",
      startTime: ishaTime,
      endTime: addMinutes(ishaTime, 30),
    })

    schedule.push({
      name: "Sleep",
      description: `Rest well - Prepare for tomorrow (8 hours)`,
      startTime: addMinutes(ishaTime, 30),
      endTime: tahajjudStart,
    })

    let current = schedule[schedule.length - 1]
    let next = schedule[0]

    for (let i = 0; i < schedule.length; i++) {
      const item = schedule[i]
      const nextItem = schedule[(i + 1) % schedule.length]

      if (now >= item.startTime && now < item.endTime) {
        current = item
        next = nextItem
        break
      } else if (now >= item.endTime && now < nextItem.startTime) {
        current = item
        next = nextItem
        break
      }
    }

    setCurrentActivity(current)
    setNextActivity(next.name)
    setTimeUntilNext(formatTimeUntil(next.startTime))
  }

  const resetLocation = () => {
    localStorage.removeItem("salah-sync-location")
    setLocation(null)
    setPrayerTimes(null)
    setError("")
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <Card className="p-8 bg-white border border-gray-200 text-center shadow-lg">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black mx-auto mb-4"></div>
          <h2 className="text-xl font-semibold text-black mb-2">Loading...</h2>
          <p className="text-gray-600">Getting your location and prayer times</p>
        </Card>
      </div>
    )
  }

  if (!location) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <Card className="p-8 bg-white border border-gray-200 text-center max-w-md shadow-lg">
          <MapPin className="h-12 w-12 text-black mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-black mb-4">Welcome to Salah Sync</h2>
          <p className="text-gray-600 mb-6">
            To show you the right activity at the right time, we need your location to get accurate prayer times.
          </p>
          {error && <p className="text-red-500 mb-4 text-sm">{error}</p>}
          <Button onClick={requestLocation} className="w-full bg-black hover:bg-gray-800 text-white" disabled={loading}>
            <MapPin className="h-4 w-4 mr-2" />
            Get My Location
          </Button>
        </Card>
      </div>
    )
  }

  if (!prayerTimes) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <Card className="p-8 bg-white border border-gray-200 text-center shadow-lg">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black mx-auto mb-4"></div>
          <h2 className="text-xl font-semibold text-black mb-2">Loading Prayer Times</h2>
          <p className="text-gray-600">Getting prayer times for {location.city}...</p>
          {error && (
            <div className="mt-4">
              <p className="text-red-500 mb-4 text-sm">{error}</p>
              <Button
                onClick={() => fetchPrayerTimes(location.latitude, location.longitude)}
                className="bg-black hover:bg-gray-800 text-white"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            </div>
          )}
        </Card>
      </div>
    )
  }

  if (!currentActivity) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <Card className="p-8 bg-white border border-gray-200 text-center shadow-lg">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black mx-auto mb-4"></div>
          <h2 className="text-xl font-semibold text-black mb-2">Calculating Schedule</h2>
          <p className="text-gray-600">Setting up your daily routine...</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      <div className="text-center max-w-2xl">
        <Card className="p-12 bg-white border border-gray-200 mb-6 shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <div className="w-8"></div>
            <div className="flex-1">
              <h1 className="text-4xl md:text-6xl font-bold text-black mb-4">{currentActivity.name}</h1>
            </div>
            {downtimeMode && (
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
              </div>
            )}
          </div>

          <p className="text-xl md:text-2xl text-gray-600 mb-8">{currentActivity.description}</p>

          {downtimeMode && currentDowntimeActivity?.type === "grip" && (
            <Button
              onClick={completeDowntimeActivity}
              className="bg-green-600 hover:bg-green-700 text-white mb-6"
              size="lg"
            >
              <Check className="h-5 w-5 mr-2" />
              Complete Grip Set
            </Button>
          )}

          {!downtimeMode && nextActivity && timeUntilNext && (
            <div className="flex items-center justify-center text-gray-500 text-lg">
              <Clock className="h-5 w-5 mr-2" />
              <span>
                Next: {nextActivity} in {timeUntilNext}
              </span>
            </div>
          )}
        </Card>

        <div className="flex items-center justify-center text-gray-400 text-sm space-x-4">
          <div className="flex items-center">
            <MapPin className="h-4 w-4 mr-1" />
            <span>{location.city}</span>
          </div>
          <span>•</span>
          <span>{currentTime.toLocaleTimeString()}</span>
          <span>•</span>
          <Button
            onClick={() => setShowSettings(!showSettings)}
            variant="ghost"
            size="sm"
            className="text-gray-400 hover:text-gray-600 p-0 h-auto"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>

        {showSettings && (
          <Card className="mt-4 p-4 bg-gray-50 border border-gray-200">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Downtime Mode</span>
                <Button
                  onClick={toggleDowntimeMode}
                  variant={downtimeMode ? "default" : "outline"}
                  size="sm"
                  className="text-xs"
                >
                  {downtimeMode ? "ON" : "OFF"}
                </Button>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Grip Strength Training</span>
                <Button
                  onClick={() => toggleGripStrength(!gripStrengthEnabled)}
                  variant={gripStrengthEnabled ? "default" : "outline"}
                  size="sm"
                  className="text-xs"
                >
                  {gripStrengthEnabled ? "ON" : "OFF"}
                </Button>
              </div>
              <Button onClick={resetLocation} variant="outline" size="sm" className="w-full text-xs">
                <RefreshCw className="h-3 w-3 mr-1" />
                Reset Location
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
