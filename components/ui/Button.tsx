import Link from "next/link";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "./cn";

const variants = {
  primary: "bg-brand text-brand-foreground shadow-sm hover:bg-brand-hover",
  default: "bg-brand text-brand-foreground shadow-sm hover:bg-brand-hover",
  secondary: "bg-brand-soft text-brand hover:bg-brand/15",
  outline: "border border-line bg-white text-ink shadow-xs hover:bg-canvas",
  ghost: "text-ink hover:bg-canvas",
};

const sizes = {
  sm: "h-8 gap-1.5 px-3 text-sm",
  md: "h-10 gap-2 px-4 text-sm",
  lg: "h-12 gap-2 px-6 text-base",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  href?: string;
};

// A button, or a next/link styled as one when href is set. Inside a form it submits, like a native button.
export function Button({ variant = "primary", size = "md", href, className, ...props }: ButtonProps) {
  const classes = cn(
    "inline-flex shrink-0 cursor-pointer items-center justify-center rounded-lg font-medium whitespace-nowrap transition-colors",
    "focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none",
    "disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
    variants[variant],
    sizes[size],
    className,
  );
  if (href) {
    return (
      <Link href={href} className={classes} aria-label={props["aria-label"]}>
        {props.children}
      </Link>
    );
  }
  return <button className={classes} {...props} />;
}
