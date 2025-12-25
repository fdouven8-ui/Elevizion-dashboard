import React from "react";

type Props = React.ComponentPropsWithoutRef<"details"> & {
  title: string;
  icon?: React.ReactNode;
  mainValue: React.ReactNode;
  summary?: React.ReactNode;
  accentColor?: string;
  children?: React.ReactNode;
  defaultOpen?: boolean;
};

export function ExpandableKpiCard({
  title,
  icon,
  mainValue,
  summary,
  accentColor = "bg-primary",
  children,
  defaultOpen = false,
  className = "",
  ...rest
}: Props) {
  return (
    <details
      className={`group rounded-lg border bg-card shadow-sm overflow-hidden ${className}`}
      open={defaultOpen}
      {...rest}
    >
      <div className={`h-1 ${accentColor}`} />
      <summary className="list-none cursor-pointer px-4 py-4">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground font-medium mb-1">{title}</p>
            <div className="text-2xl font-bold">
              {mainValue}
            </div>
            {summary && (
              <div className="mt-1 text-sm text-muted-foreground group-open:hidden">
                {summary}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {icon && (
              <div className="p-2 rounded-full bg-muted/50">
                {icon}
              </div>
            )}
            <svg
              className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
              viewBox="0 0 24 24"
              fill="none"
            >
              <path
                d="M7 10l5 5 5-5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
      </summary>

      {children && (
        <div className="px-4 pb-4 pt-1 text-sm border-t">
          {children}
        </div>
      )}
    </details>
  );
}
