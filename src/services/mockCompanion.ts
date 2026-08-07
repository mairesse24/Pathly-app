import type { ChatMessage } from "../types/app";
export function createCompanionReply(): ChatMessage { return { id: crypto.randomUUID(), author:"Pathly", text:"I’d start with 45 minutes on your Biology Lab Report, then take a real break. If you still have energy, review the photosynthesis summary—nothing more is needed tonight.", source:"Based on: BIO 214 Lab Report · due today" }; }
