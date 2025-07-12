"use client";

import * as React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { GripVertical, PlusCircle, Trash2 } from "lucide-react";
import { ScheduleItem, CustomActivity, ActivityType } from "@/lib/types";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';


interface ScheduleViewProps {
    downtimeMode: boolean;
    schedule: ScheduleItem[];
    customActivities: CustomActivity[]; // The original list of custom activities
    onAddActivity: (activity: Omit<CustomActivity, 'id'>, afterActivityId?: string) => void;
    onRemoveActivity: (activityId: string) => void;
    onReorder: (reorderedActivities: CustomActivity[]) => void;
}

function AddActivityForm({ onAddActivity, afterActivityId }: { onAddActivity: ScheduleViewProps['onAddActivity'], afterActivityId?: string }) {
    const [name, setName] = useState("");
    const [type, setType] = useState<ActivityType>("filler");
    const [duration, setDuration] = useState(30);

    const handleSubmit = () => {
        if (!name.trim()) return; // Prevent adding empty activities
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

const CORE_ACTIVITY_IDS = ['sleep', 'tahajjud', 'breakfast', 'lunch', 'dinner', 'nap', 'transition'];

function SortableScheduleItem({ item, downtimeMode, onRemoveActivity, formatScheduleTime }: { item: ScheduleItem, downtimeMode: boolean, onRemoveActivity: (id: string) => void, formatScheduleTime: (date: Date) => string }) {
    const isEditable = !item.isPrayer && !CORE_ACTIVITY_IDS.includes(item.id);

    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id, disabled: !isEditable });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <div ref={setNodeRef} style={style}>
            <div className={`flex justify-between items-center py-3`}>
                <div className="flex items-center gap-2">
                    {isEditable ? (
                        <button {...attributes} {...listeners} className="cursor-grab text-gray-500">
                            <GripVertical className="h-5 w-5" />
                        </button>
                    ) : (
                        <div className="w-7"></div> // Placeholder for alignment
                    )}
                    <div>
                        <p className="font-semibold">{item.name}</p>
                        <p className={`text-sm ${downtimeMode ? "text-gray-400" : "text-gray-600"}`}>{item.description}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <p className="text-right font-mono text-sm">{formatScheduleTime(item.startTime)}</p>
                    {isEditable && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-500" onClick={() => onRemoveActivity(item.id)}><Trash2 className="h-4 w-4" /></Button>
                    )}
                </div>
            </div>
        </div>
    )
}


export function ScheduleView({
    downtimeMode,
    schedule,
    customActivities,
    onAddActivity,
    onRemoveActivity,
    onReorder
}: ScheduleViewProps) {
    const formatScheduleTime = (date: Date) => date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
    
    const handleDragEnd = (event: DragEndEvent) => {
        const {active, over} = event;
        if (over && active.id !== over.id) {
            const oldIndex = schedule.findIndex(item => item.id === active.id);
            const newIndex = schedule.findIndex(item => item.id === over.id);
            if (oldIndex === -1 || newIndex === -1) return;
            const oldItem = schedule[oldIndex];

            const isUneditable = (item: ScheduleItem) => item.isPrayer || CORE_ACTIVITY_IDS.includes(item.id);

            // Prevent dragging of uneditable items. This is a safeguard, 
            // the primary mechanism is disabling the sortable item itself.
            if (isUneditable(oldItem)) return;

            const reorderedSchedule = arrayMove(schedule, oldIndex, newIndex);
            
            // Get the IDs of the reordered custom (non-prayer) activities.
            const reorderedIds = reorderedSchedule
                .filter(item => !item.isPrayer && !CORE_ACTIVITY_IDS.includes(item.id))
                .map(item => item.id);

            // Map the ordered IDs back to the original CustomActivity objects.
            const reorderedCustomActivities = reorderedIds.map(id => {
                const originalActivity = customActivities.find(act => act.id === id);
                if (!originalActivity) {
                    // This should theoretically not happen if data is consistent.
                    throw new Error(`Could not find original activity for id: ${id}`);
                }
                return originalActivity;
            });

            onReorder(reorderedCustomActivities);
        }
    };

    const scheduleIds = schedule.map(item => item.id);

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
                                formatScheduleTime={formatScheduleTime}
                            />
                        ))}
                    </SortableContext>
                </DndContext>
            </Card>

            <Dialog>
                <DialogTrigger asChild>
                    <Button className="fixed bottom-8 right-8 h-16 w-16 rounded-full shadow-lg z-50">
                        <PlusCircle className="h-8 w-8" />
                    </Button>
                </DialogTrigger>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add New Activity</DialogTitle>
                    </DialogHeader>
                    <AddActivityForm onAddActivity={onAddActivity} />
                </DialogContent>
            </Dialog>
        </div>
    )
} 