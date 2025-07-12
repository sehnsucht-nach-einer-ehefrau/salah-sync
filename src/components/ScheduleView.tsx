"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { MapPin, Clock, Hand, Utensils, Weight, ChevronsDown, List } from "lucide-react";
import { ScheduleItem, MealMode } from "@/lib/types";

interface ScheduleViewProps {
    downtimeMode: boolean;
    gripStrengthEnabled: boolean;
    handleSetGripEnabled: (isEnabled: boolean) => void;
    currentActivity: ScheduleItem;
    nextActivity: string;
    timeUntilNext: string;
    mealMode: MealMode;
    handleSetMealMode: (mode: MealMode) => void;
    resetLocation: () => void;
    toggleDowntimeMode: () => void;
    schedule: ScheduleItem[];
    city: string;
}

export function ScheduleView({
    downtimeMode,
    gripStrengthEnabled,
    handleSetGripEnabled,
    currentActivity,
    nextActivity,
    timeUntilNext,
    mealMode,
    handleSetMealMode,
    resetLocation,
    toggleDowntimeMode,
    schedule,
    city,
}: ScheduleViewProps) {
    const [currentTime, setCurrentTime] = useState(new Date());
    useEffect(() => {
        const timerId = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timerId);
    }, []);

    const formatScheduleTime = (date: Date) => date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

    return (
        <div className={`min-h-screen flex flex-col items-center justify-center p-4 transition-all duration-700 ease-in-out ${downtimeMode ? "bg-black" : "bg-white"}`}>
            <Collapsible className="text-center max-w-2xl w-full">
                <Card className={`relative p-8 sm:p-12 border mb-4 shadow-lg transition-all duration-700 ease-in-out ${downtimeMode ? "bg-black border-gray-800 text-white" : "bg-white border-gray-200 text-black"}`}>
                    <TooltipProvider delayDuration={0}>
                        <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="icon" className={`absolute top-3 left-3 h-8 w-8 rounded-full ${downtimeMode ? 'text-gray-400 hover:bg-white/10 hover:text-white' : 'text-gray-500 hover:bg-black/10'}`}>
                                <List className="h-5 w-5" />
                            </Button>
                        </CollapsibleTrigger>
                        <div className="absolute top-3 right-3 flex gap-1">
                            {!downtimeMode && (
                                <>
                                    <Tooltip>
                                        <TooltipTrigger asChild><Button onClick={() => handleSetMealMode('cutting')} variant="ghost" size="icon" className={`h-8 w-8 rounded-full ${mealMode === 'cutting' ? 'bg-gray-200 text-black' : 'text-gray-500 hover:bg-gray-100'}`}><ChevronsDown size={18}/></Button></TooltipTrigger>
                                        <TooltipContent><p>Cutting</p></TooltipContent>
                                    </Tooltip>
                                    <Tooltip>
                                        <TooltipTrigger asChild><Button onClick={() => handleSetMealMode('maintenance')} variant="ghost" size="icon" className={`h-8 w-8 rounded-full ${mealMode === 'maintenance' ? 'bg-gray-200 text-black' : 'text-gray-500 hover:bg-gray-100'}`}><Weight size={18}/></Button></TooltipTrigger>
                                        <TooltipContent><p>Maintenance</p></TooltipContent>
                                    </Tooltip>
                                    <Tooltip>
                                        <TooltipTrigger asChild><Button onClick={() => handleSetMealMode('bulking')} variant="ghost" size="icon" className={`h-8 w-8 rounded-full ${mealMode === 'bulking' ? 'bg-gray-200 text-black' : 'text-gray-500 hover:bg-gray-100'}`}><Utensils size={18}/></Button></TooltipTrigger>
                                        <TooltipContent><p>Bulking</p></TooltipContent>
                                    </Tooltip>
                                </>
                            )}
                            {downtimeMode && (
                                <Tooltip>
                                    <TooltipTrigger asChild><Button onClick={() => handleSetGripEnabled(!gripStrengthEnabled)} variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-white/10"><Hand className={`h-5 w-5 transition-colors ${gripStrengthEnabled ? "text-white" : "text-gray-600"}`} /></Button></TooltipTrigger>
                                    <TooltipContent className="bg-black text-white border-gray-700"><p>Grip Training: {gripStrengthEnabled ? "ON" : "OFF"}</p></TooltipContent>
                                </Tooltip>
                            )}
                        </div>
                    </TooltipProvider>

                    <h1 className="text-4xl md:text-6xl font-bold mb-2 pt-8">{currentActivity.name}</h1>
                    <p className={`text-xl md:text-2xl mb-4 ${downtimeMode ? "text-gray-300" : "text-gray-600"}`}>{currentActivity.description}</p>
                    
                    <div className={`flex items-center justify-center text-lg mt-4 ${downtimeMode ? "text-gray-400" : "text-gray-500"}`}>
                        <Clock className="h-5 w-5 mr-2 mb-1" />
                        <span>Next: {nextActivity} in {timeUntilNext}</span>
                    </div>
                </Card>

                <CollapsibleContent className="transition-all data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
                    <Card className={`text-left p-4 mb-4 ${downtimeMode ? "bg-black border-gray-800 text-white" : "bg-white"}`}>
                        {schedule.map((item, index) => (
                            <div key={index} className={`flex justify-between items-center py-2 border-b ${downtimeMode ? "border-gray-800" : ""}`}>
                                <div>
                                    <p className="font-semibold">{item.name}</p>
                                    <p className={`text-sm ${downtimeMode ? "text-gray-400" : "text-gray-600"}`}>{item.description}</p>
                                </div>
                                <div className="text-right font-mono text-sm">
                                    <p>{formatScheduleTime(item.startTime)}</p>
                                    <p>{formatScheduleTime(item.endTime)}</p>
                                </div>
                            </div>
                        ))}
                    </Card>
                </CollapsibleContent>
            </Collapsible>
            
            <div className={`flex items-center justify-center text-md gap-4 transition-all duration-700 ${downtimeMode ? "text-gray-400" : "text-gray-500"}`}>
                <button onClick={resetLocation} className="flex items-center hover:opacity-70 transition-opacity"><MapPin className="h-4 w-4 mr-1 flex-shrink-0" /><span className="truncate">{city}</span></button>
                <span>•</span>
                <TooltipProvider delayDuration={0}>
                    <Tooltip>
                        <TooltipTrigger asChild><span className="font-mono min-w-[70px] text-center">{currentTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}</span></TooltipTrigger>
                        <TooltipContent className={downtimeMode ? "bg-black text-white border-gray-700" : ""}><p>{currentTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true })}</p></TooltipContent>
                    </Tooltip>
                </TooltipProvider>
                <span>•</span>
                <AlertDialog>
                    <AlertDialogTrigger asChild><button className="hover:opacity-70 transition-opacity">{downtimeMode ? "Exit Downtime" : "Enter Downtime"}</button></AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader><AlertDialogTitle className="text-2xl">{downtimeMode ? "Exit Downtime Mode?" : "Enter Downtime Mode?"}</AlertDialogTitle><AlertDialogDescription className="text-base">{downtimeMode ? "This will return to your strict, testosterone-optimized schedule." : "This will switch to server-managed Quran/LeetCode sessions with grip training notifications."}</AlertDialogDescription></AlertDialogHeader>
                        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={toggleDowntimeMode} className="bg-black hover:bg-gray-800 text-white">{downtimeMode ? "Exit Downtime" : "Enter Downtime"}</AlertDialogAction></AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </div>
    )
} 