import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Circle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface FieldStatus {
  name: string;
  label: string;
  required: boolean;
  filled: boolean;
}

interface CompletenessProgressProps {
  fields: FieldStatus[];
  showDetails?: boolean;
  className?: string;
}

export function CompletenessProgress({ fields, showDetails = false, className }: CompletenessProgressProps) {
  const requiredFields = fields.filter(f => f.required);
  const filledRequired = requiredFields.filter(f => f.filled).length;
  const totalRequired = requiredFields.length;
  
  const allFields = fields;
  const filledAll = allFields.filter(f => f.filled).length;
  const totalAll = allFields.length;
  
  const requiredPercent = totalRequired > 0 ? Math.round((filledRequired / totalRequired) * 100) : 100;
  const overallPercent = totalAll > 0 ? Math.round((filledAll / totalAll) * 100) : 100;
  
  const isComplete = filledRequired === totalRequired;

  return (
    <div className={cn("space-y-3", className)} data-testid="completeness-progress">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">
          {isComplete ? (
            <span className="flex items-center gap-1 text-green-600">
              <CheckCircle2 className="h-4 w-4" />
              Verplichte velden compleet
            </span>
          ) : (
            <span className="flex items-center gap-1 text-amber-600">
              <AlertCircle className="h-4 w-4" />
              {filledRequired} van {totalRequired} verplichte velden
            </span>
          )}
        </span>
        <span className="text-muted-foreground">{requiredPercent}%</span>
      </div>
      
      <Progress 
        value={requiredPercent} 
        className={cn("h-2", isComplete ? "bg-green-100" : "bg-amber-100")}
        data-testid="progress-bar"
      />
      
      {showDetails && (
        <div className="grid gap-1 text-xs">
          {fields.map((field) => (
            <div 
              key={field.name} 
              className={cn(
                "flex items-center gap-2 py-1 px-2 rounded",
                field.filled ? "text-green-700 bg-green-50" : field.required ? "text-amber-700 bg-amber-50" : "text-muted-foreground"
              )}
              data-testid={`field-status-${field.name}`}
            >
              {field.filled ? (
                <CheckCircle2 className="h-3 w-3" />
              ) : (
                <Circle className="h-3 w-3" />
              )}
              <span>{field.label}</span>
              {field.required && !field.filled && (
                <span className="text-red-500 text-[10px]">*verplicht</span>
              )}
            </div>
          ))}
        </div>
      )}
      
      <div className="text-xs text-muted-foreground">
        Totaal ingevuld: {filledAll}/{totalAll} velden ({overallPercent}%)
      </div>
    </div>
  );
}

export function useFieldStatus(data: Record<string, any>, fieldDefs: { name: string; label: string; required: boolean }[]): FieldStatus[] {
  return fieldDefs.map(def => ({
    ...def,
    filled: data[def.name] !== undefined && data[def.name] !== null && data[def.name] !== "",
  }));
}
