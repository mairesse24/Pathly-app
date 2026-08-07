export type CourseTone = "sage" | "gold" | "clay";
export interface FocusTask { id: string; title: string; detail: string; duration: string; }
export interface CourseSummary { code: string; name: string; color: CourseTone; next: string; }
export interface StudyMaterial { title: string; type: string; detail: string; tone: CourseTone; }
export interface ChatMessage { id: string; author: "Pathly" | "You"; text: string; source?: string; }
export interface CalendarItem { day: number; title: string; time: string; tone: "sage" | "blue" | "gold" | "clay" | "rose"; offset?: boolean; }
export interface DegreeRequirement { title: string; progressLabel: string; percent: number; }
