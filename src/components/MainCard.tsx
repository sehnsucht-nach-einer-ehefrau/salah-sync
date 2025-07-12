"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Hand, Utensils, Weight, ChevronsDown, Clock, List } from "lucide-react";
import { Popover, PopoverContent } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScheduleItem, MealMode } from "@/lib/types";

interface MealEntryFormProps {
  mealType: MealMode;
  onLogMeal: (description: string) => void;
}

function MealEntryForm({ mealType, onLogMeal }: MealEntryFormProps) {
  const [description, setDescription] = useState("");
  const handleSubmit = () => {
    if (description.trim()) {
      onLogMeal(description);
    }
  };
  return (
    <div className="grid gap-4 p-4">
      <h4 className="font-medium leading-none">Log {mealType}</h4>
      <p className="text-sm text-muted-foreground">
        What did you eat for this meal?
      </p>
      <div className="grid gap-2">
        <Label htmlFor="meal-description">Description</Label>
        <Input 
          id="meal-description" 
          value={description} 
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g., Chicken and rice" 
        />
      </div>
      <Button onClick={handleSubmit}>Log Meal</Button>
    </div>
  );
}

interface MainCardProps {
  downtimeMode: boolean;
  gripStrengthEnabled: boolean;
  handleSetGripEnabled: (isEnabled: boolean) => void;
  currentActivity: ScheduleItem;
  nextActivity: string;
  timeUntilNext: string;
  mealMode: MealMode;
  handleSetMealMode: (mode: MealMode) => void;
  handleLogMeal: (mealType: MealMode, description: string) => void;
  toggleSchedule: () => void;
}

export function MainCard({
  downtimeMode,
  gripStrengthEnabled,
  handleSetGripEnabled,
  currentActivity,
  nextActivity,
  timeUntilNext,
  mealMode,
  handleSetMealMode,
  handleLogMeal,
  toggleSchedule,
}: MainCardProps) {
  const [selectedMealType, setSelectedMealType] = useState<MealMode | null>(null);
  const [isMealPopoverOpen, setMealPopoverOpen] = useState(false);
  
  const mealButtons: {type: MealMode, icon: React.ReactNode}[] = [
    { type: 'cutting', icon: <ChevronsDown size={18}/> },
    { type: 'maintenance', icon: <Weight size={18}/> },
    { type: 'bulking', icon: <Utensils size={18}/> },
  ];

  return (
    <div className={`w-full flex flex-col items-center justify-center p-4`}>
      <div className="text-center max-w-2xl w-full">
        <Card className={`relative p-8 sm:p-12 border mb-4 shadow-lg transition-colors duration-700 ease-in-out ${downtimeMode ? "bg-black border-gray-800 text-white" : "bg-white border-gray-200 text-black"}`}>
          <TooltipProvider delayDuration={0}>
            <div className="absolute top-3 left-3">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button onClick={toggleSchedule} variant="ghost" size="icon" className="h-8 w-8 rounded-full text-gray-500 hover:bg-gray-100">
                    <List size={18} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent><p>Show/Hide Schedule</p></TooltipContent>
              </Tooltip>
            </div>
            <div className="absolute top-3 right-3 flex gap-1">
              
              {!downtimeMode && mealButtons.map(({ type, icon }) => (
                <Popover
                  key={type}
                  open={isMealPopoverOpen && selectedMealType === type}
                  onOpenChange={(open) => {
                    setMealPopoverOpen(open);
                    if (!open) {
                      setSelectedMealType(null); // Reset selection when popover closes
                    }
                  }}
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        onClick={() => {
                          // If clicking the already active meal mode, toggle the popover
                          if (mealMode === type) {
                            setSelectedMealType(type);
                            setMealPopoverOpen(!isMealPopoverOpen);
                          } else {
                            // If clicking a new meal mode, set it and close any open popover
                            handleSetMealMode(type);
                            setMealPopoverOpen(false);
                            setSelectedMealType(null);
                          }
                        }}
                        variant="ghost"
                        size="icon"
                        className={`h-8 w-8 rounded-full ${mealMode === type ? 'bg-gray-200 text-black' : 'text-gray-500 hover:bg-gray-100'}`}
                      >
                        {icon}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent><p>{type.charAt(0).toUpperCase() + type.slice(1)}</p></TooltipContent>
                  </Tooltip>
                  <PopoverContent className="w-80">
                    <MealEntryForm mealType={type} onLogMeal={(desc) => {
                        handleLogMeal(type, desc);
                        setMealPopoverOpen(false); // Close popover on submission
                      }} />
                  </PopoverContent>
                </Popover>
              ))}
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
      </div>
    </div>
  );
} 