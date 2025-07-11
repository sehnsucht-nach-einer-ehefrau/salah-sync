import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MapPin, Clock, Hand, Utensils, Weight, ChevronsDown } from "lucide-react";
import { ScheduleItem, MealMode } from "@/lib/schedule-logic";
import { Location, DowntimeActivity } from "@/lib/types";

interface ScheduleViewProps {
    downtimeMode: boolean;
    gripStrengthEnabled: boolean;
    handleSetGripEnabled: (isEnabled: boolean) => void;
    currentActivity: ScheduleItem;
    currentDowntimeActivity: DowntimeActivity | null;
    nextActivity: string;
    timeUntilNext: string;
    mealMode: MealMode;
    handleSetMealMode: (mode: MealMode) => void;
    resetLocation: () => void;
    location: Location;
    currentTime: Date;
    showDowntimeDialog: boolean;
    setShowDowntimeDialog: (open: boolean) => void;
    toggleDowntimeMode: () => void;
}

export function ScheduleView({
    downtimeMode,
    gripStrengthEnabled,
    handleSetGripEnabled,
    currentActivity,
    currentDowntimeActivity,
    nextActivity,
    timeUntilNext,
    mealMode,
    handleSetMealMode,
    resetLocation,
    location,
    currentTime,
    showDowntimeDialog,
    setShowDowntimeDialog,
    toggleDowntimeMode
}: ScheduleViewProps) {
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
                        <div className={`flex items-center justify-center text-lg mt-4 ${downtimeMode ? "text-gray-400" : "text-gray-500"}`}>
                            <Clock className="h-5 w-5 mr-2 mb-1" />
                            <span>Time Remaining: {timeUntilNext}</span>
                        </div>
                    )}

                    {nextActivity && timeUntilNext && currentDowntimeActivity?.type !== 'grip' && (
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
    )
} 