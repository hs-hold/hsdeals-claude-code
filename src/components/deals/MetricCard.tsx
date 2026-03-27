import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

interface MetricCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  icon?: ReactNode;
  trend?: 'positive' | 'negative' | 'neutral';
  className?: string;
}

export function MetricCard({ label, value, subValue, icon, trend, className }: MetricCardProps) {
  return (
    <div className={cn(
      "p-4 rounded-xl bg-card border border-border",
      className
    )}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {label}
          </p>
          <p className={cn(
            "text-2xl font-bold mt-1",
            trend === 'positive' && "text-success",
            trend === 'negative' && "text-destructive",
            trend === 'neutral' && "text-foreground"
          )}>
            {value}
          </p>
          {subValue && (
            <p className="text-sm text-muted-foreground mt-0.5">{subValue}</p>
          )}
        </div>
        {icon && (
          <div className={cn(
            "p-2 rounded-lg",
            trend === 'positive' && "bg-success/10 text-success",
            trend === 'negative' && "bg-destructive/10 text-destructive",
            trend === 'neutral' && "bg-muted text-muted-foreground"
          )}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
