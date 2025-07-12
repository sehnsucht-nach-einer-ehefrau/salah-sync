"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Hand, Utensils, Weight, ChevronsDown, Clock, List } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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

  
    const mealButtons: {type: MealMode, icon: React.ReactNode, tooltip: string}[] = [
      { type: 'cut', icon: <ChevronsDown size={18}/>, tooltip: 'Cutting' },
      { type: 'maintain', icon: <Weight size={18}/>, tooltip: 'Maintenance' },
      { type: 'bulk', icon: <Utensils size={18}/>, tooltip: 'Bulking' },
      { type: 'log', icon: <List size={18}/>, tooltip: 'Log Meal' },
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
            <div className="absolute top-3 right-3 flex items-center gap-2">
              {!downtimeMode && (
                <div className="flex items-center p-0.5 rounded-full bg-gray-100 gap-0.5">
                  {mealButtons.slice(0, 2).map(({ type, icon, tooltip }) => {
                    const isSelected = mealMode === type;
                    return (
                      <TooltipProvider key={type}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className={`relative h-8 w-8 rounded-full ${isSelected ? 'bg-white text-black shadow-sm' : 'text-gray-500 hover:bg-white/80'}`}
                              onClick={() => handleSetMealMode(type)}
                            >
                              {icon}
                              {isSelected && <div className="absolute bottom-1.5 h-1 w-1 rounded-full bg-blue-500"></div>}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent><p>{tooltip}</p></TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    );
                  })}
                  <div className="flex bg-gray-200/80 rounded-full">
                    {mealButtons.slice(2, 4).map(({ type, icon, tooltip }) => {
                      const isSelected = mealMode === type;
                      return (
                        <Popover key={type}>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <PopoverTrigger asChild disabled={type === 'bulk' && !isSelected}>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className={`relative h-8 w-8 rounded-full ${isSelected ? 'bg-white text-black shadow-sm' : 'text-gray-500 hover:bg-white/80'}`}
                                    onClick={() => handleSetMealMode(type)}
                                  >
                                    {icon}
                                    {isSelected && <div className="absolute bottom-1.5 h-1 w-1 rounded-full bg-blue-500"></div>}
                                  </Button>
                                </PopoverTrigger>
                              </TooltipTrigger>
                              <TooltipContent><p>{tooltip}</p></TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <PopoverContent className="w-80">
                            <MealEntryForm mealType={type} onLogMeal={(desc) => handleLogMeal(type, desc)} />
                          </PopoverContent>
                        </Popover>
                      );
                    })}
                  </div>
                </div>
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
      </div>
    </div>
  );
} 