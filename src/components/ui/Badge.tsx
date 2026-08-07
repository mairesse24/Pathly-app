import type { ReactNode } from "react";
export type BadgeTone = "green" | "gold" | "rose" | "gray";
export function Badge({ children, tone = "green" }: { children: ReactNode; tone?: BadgeTone }) { return <span className={`badge badge-${tone}`}>{children}</span>; }
