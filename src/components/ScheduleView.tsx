import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { MapPin, Clock, Hand, Utensils, Weight, ChevronsDown, ChevronsUpDown } from "lucide-react";
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
    schedule
}: ScheduleViewProps) {
    const formatScheduleTime = (date: Date) => date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

    return (
        <div className={`min-h-screen flex flex-col items-center justify-center p-4 transition-all duration-700 ease-in-out ${downtimeMode ? "bg-black" : "bg-white"}`}>
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
                    
                    <div className={`flex items-center justify-center text-lg mt-4 ${downtimeMode ? "text-gray-400" : "text-gray-500"}`}>
                        <Clock className="h-5 w-5 mr-2 mb-1" />
                        <span>Next: {nextActivity} in {timeUntilNext}</span>
                    </div>
                </Card>

                <div className="w-full flex justify-center">
                    <Collapsible className="w-full max-w-2xl">
                        <CollapsibleTrigger asChild>
                            <Button variant="ghost" className={`w-full mb-4 ${downtimeMode ? "text-white hover:text-white hover:bg-gray-800" : ""}`}>
                                Full Schedule
                                <ChevronsUpDown className="h-4 w-4 ml-2" />
                            </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
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
                </div>


                {!downtimeMode && (
                    <div className="mb-4 flex justify-center gap-2">
                        <Button variant={mealMode === 'cutting' ? 'default' : 'outline'} onClick={() => handleSetMealMode('cutting')} className="gap-2"><ChevronsDown size={16}/>Cutting</Button>
                        <Button variant={mealMode === 'maintenance' ? 'default' : 'outline'} onClick={() => handleSetMealMode('maintenance')} className="gap-2"><Weight size={16}/>Maintenance</Button>
                        <Button variant={mealMode === 'bulking' ? 'default' : 'outline'} onClick={() => handleSetMealMode('bulking')} className="gap-2"><Utensils size={16}/>Bulking</Button>
                    </div>
                )}
                
                <div className={`flex items-center justify-center text-md gap-4 transition-all duration-700 ${downtimeMode ? "text-gray-400" : "text-gray-500"}`}>
                    <button onClick={resetLocation} className="flex items-center hover:opacity-70 transition-opacity"><MapPin className="h-4 w-4 mr-1 flex-shrink-0" /> Reset Location</button>
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
        </div>
    )
} 