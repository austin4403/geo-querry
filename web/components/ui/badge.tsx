import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "success" | "warning" | "destructive" | "outline";
}

export function Badge({
  className,
  variant = "default",
  ...props
}: BadgeProps) {
  const variants = {
    default: "bg-[var(--surface)] text-[var(--foreground)] border border-[var(--border)]",
    success: "bg-[var(--status-success-bg)] text-[var(--status-success-fg)] border border-[var(--status-success-border)]",
    warning: "bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)] border border-[var(--status-warning-border)]",
    destructive: "bg-[var(--status-destructive-bg)] text-[var(--status-destructive-fg)] border border-[var(--status-destructive-border)]",
    outline: "text-[var(--foreground)] border border-[var(--border)]",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:ring-offset-2",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}
