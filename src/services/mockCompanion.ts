import type { ChatMessage } from "../types/app";
export function createCompanionReply(): ChatMessage { return { id: crypto.randomUUID(), author:"Pathly", text:"Personalized companion guidance is coming in a later milestone. Your message was not analyzed or saved." }; }
