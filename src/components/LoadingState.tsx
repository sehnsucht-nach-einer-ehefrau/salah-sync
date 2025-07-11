import { Card } from "@/components/ui/card";

interface LoadingStateProps {
  message?: string;
  description?: string;
}

export function LoadingState({ message, description }: LoadingStateProps) {
    if (!message && !description) {
        return (
            <div className="min-h-screen bg-white flex items-center justify-center">
                <Card className="p-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black"></div>
                </Card>
            </div>
        )
    }
  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      <Card className="p-8 bg-white border border-gray-200 text-center shadow-lg">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black mx-auto mb-4"></div>
        {message && <h2 className="text-xl font-semibold text-black mb-2">{message}</h2>}
        {description && <p className="text-gray-600">{description}</p>}
      </Card>
    </div>
  );
} 