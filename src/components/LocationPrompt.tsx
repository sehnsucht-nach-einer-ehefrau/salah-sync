import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MapPin } from "lucide-react";

interface LocationPromptProps {
  requestLocation: () => void;
  error: string;
}

export function LocationPrompt({ requestLocation, error }: LocationPromptProps) {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      <Card className="p-8 bg-white border border-gray-200 text-center max-w-md shadow-lg">
        <MapPin className="h-12 w-12 text-black mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-black mb-4">Performance Islam</h2>
        <p className="text-gray-600 mb-6">
          To build your dynamic schedule, we need your location for accurate prayer times.
        </p>
        {error && <p className="text-red-500 mb-4 text-sm">{error}</p>}
        <Button onClick={requestLocation} className="w-full bg-black hover:bg-gray-800 text-white">
          <MapPin className="h-4 w-4 mr-2" /> Get My Location
        </Button>
      </Card>
    </div>
  );
} 