"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MapPin, List, PlusCircle, Trash2 } from "lucide-react";
import { ScheduleItem, CustomActivity, ActivityType } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ScheduleViewProps {
    isVisible: boolean;
    downtimeMode: boolean;
    resetLocation: () => void;
    toggleDowntimeMode: () => void;
    schedule: ScheduleItem[];
    city: string;
    onAddActivity: (activity: Omit<CustomActivity, 'id'>, afterActivityId: string) => void;
    onRemoveActivity: (activityId: string) => void;
}

function AddActivityForm({ afterActivityId, onAddActivity }: { afterActivityId: string; onAddActivity: ScheduleViewProps['onAddActivity'] }) {
    const [name, setName] = useState("");
    const [type, setType] = useState<ActivityType>("filler");
    const [duration, setDuration] = useState(30);

    const handleSubmit = () => {
        onAddActivity({ name, type, duration: type === 'action' ? duration : undefined }, afterActivityId);
    };

    return (
        <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="name" className="text-right">Name</Label>
                <Input id="name" value={name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)} className="col-span-3" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="type" className="text-right">Type</Label>
                <Select value={type} onValueChange={(value: ActivityType) => setType(value)}>
                    <SelectTrigger className="col-span-3"><SelectValue placeholder="Select type" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="filler">Filler (fills available time)</SelectItem>
                        <SelectItem value="action">Action (fixed duration)</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            {type === 'action' && (
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="duration" className="text-right">Duration (min)</Label>
                    <Input id="duration" type="number" value={duration} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDuration(parseInt(e.target.value, 10))} className="col-span-3" />
                </div>
            )}
            <DialogFooter>
                <DialogClose asChild>
                    <Button onClick={handleSubmit}>Add Activity</Button>
                </DialogClose>
            </DialogFooter>
        </div>
    );
}


export function ScheduleView({
    isVisible,
    downtimeMode,
    resetLocation, toggleDowntimeMode,
    schedule, city, onAddActivity, onRemoveActivity
}: ScheduleViewProps) {
    const [isScheduleOpen, setIsScheduleOpen] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());
    useEffect(() => {
        const timerId = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timerId);
    }, []);
    const formatScheduleTime = (date: Date) => date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

    return (
        <div className={cn(
            "fixed inset-0 bg-black bg-opacity-50 z-40 transition-opacity duration-500",
            isVisible ? "opacity-100" : "opacity-0 pointer-events-none"
        )}>
            <div className={cn(
                "absolute top-0 right-0 h-full w-full max-w-md bg-white dark:bg-gray-900 shadow-lg transform transition-transform duration-500",
                isVisible ? "translate-x-0" : "translate-x-full"
            )}>
                {/* Header */}
                <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-700">
                    <h2 className="text-lg font-semibold">Schedule</h2>
                    <Button variant="ghost" size="icon" onClick={() => setIsScheduleOpen(!isScheduleOpen)}>
                        <List className="h-5 w-5" />
                    </Button>
                </div>

                {/* Content */}
                <div className="p-4">
                    {schedule.map((item) => (
                        <div key={item.activityId}>
                            <div className={`flex justify-between items-center py-3`}>
                                <div>
                                    <p className="font-semibold">{item.name}</p>
                                    <p className={`text-sm ${downtimeMode ? "text-gray-400" : "text-gray-600"}`}>{item.description}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <p className="text-right font-mono text-sm">{formatScheduleTime(item.startTime)}</p>
                                    {!item.isPrayer && (
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-500" onClick={() => onRemoveActivity(item.activityId!)}><Trash2 className="h-4 w-4" /></Button>
                                    )}
                                </div>
                            </div>
                            <Dialog>
                                <DialogTrigger asChild>
                                    <div className="flex items-center justify-center -my-2">
                                        <button className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-400 py-1">
                                            <PlusCircle className="h-3 w-3"/>
                                            <span>Add Activity</span>
                                        </button>
                                    </div>
                                </DialogTrigger>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>Add activity after {item.name}</DialogTitle>
                                    </DialogHeader>
                                    <AddActivityForm afterActivityId={item.activityId!} onAddActivity={onAddActivity} />
                                </DialogContent>
                            </Dialog>
                        </div>
                    ))}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-200 dark:border-gray-700">
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
            </div>
        </div>
    )
} 