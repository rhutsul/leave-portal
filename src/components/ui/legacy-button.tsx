import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "ghost";

const BASE =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";

const VARIANTS: Record<Variant, string> = {
  primary: "border border-primary bg-primary text-primary-foreground hover:bg-primary/90 hover:border-primary/90",
  ghost: "border border-input bg-card text-foreground hover:bg-muted hover:text-foreground",
};

export function buttonClass(variant: Variant = "primary", className = "") {
  return `${BASE} ${VARIANTS[variant]} ${className}`;
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant };

export function Button({ variant = "primary", className = "", type = "button", ...props }: ButtonProps) {
  return <button type={type} className={buttonClass(variant, className)} {...props} />;
}

export function ButtonLink({
  href,
  variant = "primary",
  className = "",
  children,
}: {
  href: string;
  variant?: Variant;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={buttonClass(variant, className)}>
      {children}
    </Link>
  );
}
