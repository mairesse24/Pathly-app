import type { ChatMessage } from "../types/app"
import { createId } from "../utils/createId"
export function createCompanionReply(): ChatMessage {
  return {
    id: createId(),
    author: "Pathly",
    text: "Personalized companion guidance is coming in a later milestone. Your message was not analyzed or saved.",
  }
}
