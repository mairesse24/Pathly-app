import type { HTMLAttributes, ReactNode } from "react";
export function Card({ children, className = "", ...props }: HTMLAttributes<HTMLElement> & { children: ReactNode }) { return <section {...props} className={`card ${className}`}>{children}</section>; }
