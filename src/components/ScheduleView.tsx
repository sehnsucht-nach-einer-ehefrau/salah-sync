"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { GripVertical, MapPin, PlusCircle, Trash2 } from "lucide-react";
import { ScheduleItem, CustomActivity, ActivityType } from "@/lib/types";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';


interface ScheduleViewProps {
    downtimeMode: boolean;
    resetLocation: () => void;
    toggleDowntimeMode: () => void;
    schedule: ScheduleItem[];
    city: string;
    onAddActivity: (activity: Omit<CustomActivity, 'id'>, afterActivityId: string) => void;
    onRemoveActivity: (activityId: string) => void;
    onReorder: (reorderedActivities: CustomActivity[]) => void;
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

function SortableScheduleItem({ item, downtimeMode, onRemoveActivity, onAddActivity, formatScheduleTime }: { item: ScheduleItem, downtimeMode: boolean, onRemoveActivity: (id: string) => void, onAddActivity: ScheduleViewProps['onAddActivity'], formatScheduleTime: (date: Date) => string }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
    } = useSortable({id: item.id});

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <div ref={setNodeRef} style={style}>
            <div className={`flex justify-between items-center py-3`}>
                <div className="flex items-center gap-2">
                    {!item.isPrayer && (
                        <button {...attributes} {...listeners} className="cursor-grab text-gray-500">
                            <GripVertical className="h-5 w-5" />
                        </button>
                    )}
                     {item.isPrayer && <div className="w-7"></div>}
                    <div>
                        <p className="font-semibold">{item.name}</p>
                        <p className={`text-sm ${downtimeMode ? "text-gray-400" : "text-gray-600"}`}>{item.description}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <p className="text-right font-mono text-sm">{formatScheduleTime(item.startTime)}</p>
                    {!item.isPrayer && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-500" onClick={() => onRemoveActivity(item.id)}><Trash2 className="h-4 w-4" /></Button>
                    )}
                </div>
            </div>
            {!item.isPrayer && (
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
                    <AddActivityForm afterActivityId={item.id} onAddActivity={onAddActivity} />
                </DialogContent>
            </Dialog>
            )}
        </div>
    )
}


export function ScheduleView({
    downtimeMode,
    resetLocation, toggleDowntimeMode,
    schedule, city, onAddActivity, onRemoveActivity, onReorder
}: ScheduleViewProps) {
    const [currentTime, setCurrentTime] = useState(new Date());
    useEffect(() => {
        const timerId = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timerId);
    }, []);
    const formatScheduleTime = (date: Date) => date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
    
    const handleDragEnd = (event: DragEndEvent) => {
        const {active, over} = event;
        if (over && active.id !== over.id) {
            const oldIndex = schedule.findIndex(item => item.id === active.id);
            const newIndex = schedule.findIndex(item => item.id === over.id);
            if (oldIndex === -1 || newIndex === -1) return;
            if (schedule[oldIndex].isPrayer || schedule[newIndex].isPrayer) return;

            const reorderedSchedule = arrayMove(schedule, oldIndex, newIndex);
            
            // The types are now compatible, so we can just filter.
            const reorderedCustomActivities = reorderedSchedule.filter(item => !item.isPrayer);

            onReorder(reorderedCustomActivities as CustomActivity[]);
        }
    };

    const scheduleIds = schedule.filter(item => !item.isPrayer).map(item => item.id);

    return (
        <div className="w-full max-w-2xl mx-auto p-4">
            <Card className={`text-left p-4 mb-4 transition-colors ${downtimeMode ? "bg-black border-gray-800 text-white" : "bg-white"}`}>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={scheduleIds} strategy={verticalListSortingStrategy}>
                        {schedule.map((item) => (
                            <SortableScheduleItem 
                                key={item.id} 
                                item={item} 
                                downtimeMode={downtimeMode} 
                                onRemoveActivity={onRemoveActivity} 
                                onAddActivity={onAddActivity}
                                formatScheduleTime={formatScheduleTime}
                            />
                        ))}
                    </SortableContext>
                </DndContext>
            </Card>

            <div className={`flex items-center justify-center text-md gap-4 transition-colors ${downtimeMode ? "text-gray-400" : "text-gray-500"}`}>
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