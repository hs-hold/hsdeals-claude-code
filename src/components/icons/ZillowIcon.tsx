import { cn } from "@/lib/utils";

interface ZillowIconProps {
  className?: string;
  size?: number;
}

export function ZillowIcon({ className, size = 16 }: ZillowIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("inline-block", className)}
    >
      {/* Zillow "Z" logo style */}
      <path
        d="M3 5L21 5L12 12L21 12L21 19L3 19L12 12L3 12L3 5Z"
        fill="currentColor"
      />
    </svg>
  );
}
