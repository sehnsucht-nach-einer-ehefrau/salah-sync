"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Hand, Utensils, Weight, ChevronsDown, List, Clock } from "lucide-react";
import { ScheduleItem, MealMode } from "@/lib/types";

interface MainCardProps {
  downtimeMode: boolean;
  gripStrengthEnabled: boolean;
  handleSetGripEnabled: (isEnabled: boolean) => void;
  currentActivity: ScheduleItem;
  nextActivity: string;
  timeUntilNext: string;
  mealMode: MealMode;
  handleSetMealMode: (mode: MealMode) => void;
  toggleSchedule: () => void;
  resetLocation: () => void;
  toggleDowntimeMode: () => void;
  city: string;
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
  toggleSchedule,
}: MainCardProps) {
  return (
    <div className={`min-h-screen w-full flex flex-col items-center justify-center p-4 transition-all duration-700 ease-in-out ${downtimeMode ? "bg-black" : "bg-white"}`}>
      <div className="text-center max-w-2xl w-full">
        <Card className={`relative p-8 sm:p-12 border mb-4 shadow-lg transition-all duration-700 ease-in-out ${downtimeMode ? "bg-black border-gray-800 text-white" : "bg-white border-gray-200 text-black"}`}>
          <TooltipProvider delayDuration={0}>
            <Button onClick={toggleSchedule} variant="ghost" size="icon" className={`absolute top-3 left-3 h-8 w-8 rounded-full ${downtimeMode ? 'text-gray-400 hover:bg-white/10 hover:text-white' : 'text-gray-500 hover:bg-black/10'}`}>
              <List className="h-5 w-5" />
            </Button>
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
      </div>
    </div>
  );
} 