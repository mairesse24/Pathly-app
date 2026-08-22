import { supabase } from "../lib/supabase"
import type {
  CompanionConversation,
  CompanionMessage,
} from "../types/companion"
import { browserTimeZone } from "../utils/dateTime"

export async function getLatestCompanionConversation() {
  const { data: conversation, error } = await supabase
    .from("companion_conversations")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!conversation) return { conversation: null, messages: [] }
  const { data: messages, error: messagesError } = await supabase
    .from("companion_messages")
    .select("*")
    .eq("conversation_id", conversation.id)
    .order("created_at")
  if (messagesError) throw messagesError
  return {
    conversation: conversation as CompanionConversation,
    messages: messages as CompanionMessage[],
  }
}

export async function listCompanionConversations() {
  const { data, error } = await supabase
    .from("companion_conversations")
    .select("*")
    .order("updated_at", { ascending: false })
  if (error) throw error
  return data as CompanionConversation[]
}

export async function getCompanionConversationMessages(conversationId: string) {
  const { data, error } = await supabase
    .from("companion_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at")
  if (error) throw error
  return data as CompanionMessage[]
}

export async function deleteCompanionConversation(conversationId: string) {
  const { error } = await supabase
    .from("companion_conversations")
    .delete()
    .eq("id", conversationId)
  if (error) throw error
}

export async function sendCompanionMessage(input: {
  conversationId: string | null
  message: string
}) {
  const { data, error } = await supabase.functions.invoke("pathly-companion", {
    body: {
      conversation_id: input.conversationId,
      message: input.message,
      timezone: browserTimeZone(),
    },
  })
  if (error || data?.error || !data?.message)
    throw new Error("companion_failed")
  return {
    conversation: data.conversation as CompanionConversation,
    userMessage: data.user_message as CompanionMessage,
    message: data.message as CompanionMessage,
  }
}
