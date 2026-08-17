import { useEffect, useRef, useState } from "react"
import {
  deleteCompanionConversation,
  getCompanionConversationMessages,
  getLatestCompanionConversation,
  listCompanionConversations,
  sendCompanionMessage,
} from "../../services/companion"
import type { CompanionConversation, CompanionMessage } from "../../types/companion"
import { Icon } from "../ui/Icon"
import "./ChatPanel.css"

const prompts = ["What should I focus on today?", "Quiz me on my latest lecture.", "What assignments are coming up?", "Help me plan tonight.", "Explain this lecture concept."]

export function ChatPanel() {
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [conversations, setConversations] = useState<CompanionConversation[]>([])
  const [messages, setMessages] = useState<CompanionMessage[]>([])
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<CompanionConversation | null>(null)
  const [error, setError] = useState("")
  const logRef = useRef<HTMLDivElement>(null)
  const submittingRef = useRef(false)
  const optimisticSequence = useRef(0)

  async function refreshHistory() {
    const rows = await listCompanionConversations()
    setConversations(rows)
    return rows
  }

  useEffect(() => {
    Promise.all([getLatestCompanionConversation(), listCompanionConversations()])
      .then(([latest, history]) => {
        setConversationId(latest.conversation?.id || null)
        setMessages(latest.messages)
        setConversations(history)
      })
      .catch(() => setError("Pathly couldn't load your conversations. Try refreshing."))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, sending])

  function newChat() {
    if (sending) return
    setConversationId(null)
    setMessages([])
    setMessage("")
    setError("")
    setHistoryOpen(false)
  }

  async function openConversation(conversation: CompanionConversation) {
    if (sending || conversation.id === conversationId) return
    setLoading(true)
    setError("")
    try {
      setMessages(await getCompanionConversationMessages(conversation.id))
      setConversationId(conversation.id)
      setHistoryOpen(false)
    } catch {
      setError("Pathly couldn't open that conversation. Try again.")
    } finally {
      setLoading(false)
    }
  }

  async function deleteConversation() {
    if (!deleteTarget) return
    const id = deleteTarget.id
    setError("")
    try {
      await deleteCompanionConversation(id)
      setConversations((current) => current.filter((conversation) => conversation.id !== id))
      setDeleteTarget(null)
      if (id === conversationId) newChat()
    } catch {
      setError("Pathly couldn't delete that conversation. Try again.")
    }
  }

  const send = async () => {
    const text = message.trim()
    if (!text || submittingRef.current) return
    submittingRef.current = true
    const localId = `pending-${++optimisticSequence.current}`
    const optimistic: CompanionMessage = { id: localId, conversation_id: conversationId || "pending", user_id: "current", request_id: "pending", role: "user", content: text, sources: [], metadata: {}, created_at: new Date().toISOString() }
    setMessage("")
    setError("")
    setSending(true)
    setMessages((current) => [...current, optimistic])
    try {
      const result = await sendCompanionMessage({ conversationId, message: text })
      setConversationId(result.conversation.id)
      setMessages((current) => [...current.filter((item) => item.id !== localId), result.userMessage, result.message])
      await refreshHistory()
    } catch {
      setMessages((current) => current.filter((item) => item.id !== localId))
      setMessage(text)
      setError("Pathly couldn't answer that right now. Try again.")
    } finally {
      submittingRef.current = false
      setSending(false)
    }
  }

  return (
    <section className="card chat-card">
      <div className="chat-toolbar">
        <button className="chat-history-toggle" onClick={() => setHistoryOpen((open) => !open)} aria-expanded={historyOpen}>Conversations</button>
        <button className="chat-new" onClick={newChat} disabled={sending}>+ New chat</button>
      </div>
      <div className="chat-layout">
        <aside className={`chat-history ${historyOpen ? "open" : ""}`} aria-label="Conversation history">
          <div className="chat-history-heading"><strong>Recent chats</strong><button onClick={newChat} disabled={sending}>+ New chat</button></div>
          {conversations.length ? conversations.map((conversation) => (
            <div className="chat-history-row" key={conversation.id}>
              <button className={conversation.id === conversationId ? "active" : ""} onClick={() => void openConversation(conversation)}>{conversation.title || "New conversation"}</button>
              <button aria-label={`Delete ${conversation.title || "conversation"}`} onClick={() => setDeleteTarget(conversation)}>×</button>
            </div>
          )) : <p>No saved conversations yet.</p>}
        </aside>
        <div className="chat-main">
          <div className="chat-log" ref={logRef} aria-live="polite">
            {loading && <p className="chat-status">Loading your conversation...</p>}
            {!loading && !messages.length && <div className="chat-welcome"><h3>What can Pathly help you work through?</h3><p>Ask about your saved courses, upcoming work, study plan, or processed lecture materials.</p></div>}
            {messages.map((item) => <div className={`message ${item.role === "user" ? "from-user" : "from-pathly"}`} key={item.id}><div className="message-label">{item.role === "user" ? "You" : "Pathly"}</div><p>{item.content}</p>{!!item.sources?.length && <div className="message-sources"><strong>Sources</strong>{item.sources.map((source) => <span key={`${item.id}-${source.label}`}>{source.label}</span>)}</div>}{!!item.metadata?.things_to_double_check?.length && <div className="double-check"><strong>Things to double-check</strong><ul>{item.metadata.things_to_double_check.map((check) => <li key={check}>{check}</li>)}</ul></div>}</div>)}
            {sending && <p className="chat-status">Pathly is reviewing the relevant details...</p>}
          </div>
          <div className="suggestions">{prompts.map((prompt) => <button disabled={sending} key={prompt} onClick={() => setMessage(prompt)}>{prompt}</button>)}</div>
          {error && <p className="chat-error" role="alert">{error}</p>}
          <div className="chat-input"><input maxLength={2000} value={message} disabled={loading || sending} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void send() } }} placeholder="Ask Pathly about your studies..." aria-label="Message Pathly Companion" /><button disabled={loading || sending || !message.trim()} onClick={() => void send()} aria-label="Send message"><Icon name="send" /></button></div>
        </div>
      </div>
      {deleteTarget && <div className="chat-confirm" role="dialog" aria-modal="true" aria-label="Delete conversation"><h3>Delete this conversation?</h3><p>This removes the Companion conversation, not your Pathly academic data.</p><div><button onClick={() => void deleteConversation()}>Delete conversation</button><button onClick={() => setDeleteTarget(null)}>Cancel</button></div></div>}
    </section>
  )
}
