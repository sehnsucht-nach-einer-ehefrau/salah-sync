"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MealMode } from "@/lib/types";

interface MealEntryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (description: string) => void;
  mealType: MealMode | null;
}

export function MealEntryDialog({ isOpen, onClose, onSubmit, mealType }: MealEntryDialogProps) {
  const [description, setDescription] = useState("");

  const handleSubmit = () => {
    if (description.trim()) {
      onSubmit(description);
      onClose();
      setDescription("");
    }
  };

  if (!mealType) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Log {mealType} Meal</DialogTitle>
          <DialogDescription>
            What did you eat for your {mealType} meal? Log it here.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="meal-description" className="text-right">
              Meal
            </Label>
            <Input
              id="meal-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="col-span-3"
              placeholder="e.g., Chicken and rice"
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" onClick={handleSubmit}>Save Meal</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 