import React from "react";
import { ChevronRight } from "lucide-react";

type Props = React.ComponentPropsWithoutRef<"details"> & {
  title: string;
  icon?: React.ReactNode;
  countBadge?: number;
  variant?: "default" | "warning" | "danger";
  summaryLine?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
};

const variantStyles: Record<NonNullable<Props["variant"]>, string> = {
  default: "border-slate-200",
  warning: "border-amber-200",
  danger: "border-red-200",
};

const badgeStyles: Record<NonNullable<Props["variant"]>, string> = {
  default: "bg-slate-100 text-slate-700",
  warning: "bg-amber-100 text-amber-800",
  danger: "bg-red-100 text-red-800",
};

const iconBgStyles: Record<NonNullable<Props["variant"]>, string> = {
  default: "bg-slate-50",
  warning: "bg-amber-50",
  danger: "bg-red-50",
};

export function ExpandableCard({
  title,
  icon,
  countBadge,
  variant = "default",
  summaryLine,
  children,
  defaultOpen = false,
  className = "",
  ...rest
}: Props) {
  return (
    <details
      className={[
        "group rounded-lg border bg-card shadow-sm",
        variantStyles[variant],
        className,
      ].join(" ")}
      open={defaultOpen}
      {...rest}
    >
      <summary className="list-none cursor-pointer select-none px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {icon && (
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg shrink-0 ${iconBgStyles[variant]}`}>
                {icon}
              </div>
            )}

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{title}</span>
                {typeof countBadge === "number" && (
                  <span
                    className={[
                      "inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-xs font-medium",
                      badgeStyles[variant],
                    ].join(" ")}
                  >
                    {countBadge}
                  </span>
                )}
              </div>
              {summaryLine && (
                <div className="text-xs text-muted-foreground mt-0.5 group-open:hidden">
                  {summaryLine}
                </div>
              )}
            </div>
          </div>

          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200 group-open:rotate-90" />
        </div>
      </summary>

      <div className="px-4 pb-4 pt-1">
        {children}
      </div>
    </details>
  );
}
