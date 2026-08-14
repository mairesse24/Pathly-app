import { useEffect, useRef, useState } from "react"
import {
  getLatestCompanionConversation,
  sendCompanionMessage,
} from "../../services/companion"
import type { CompanionMessage } from "../../types/companion"
import { Icon } from "../ui/Icon"

const prompts = [
  "What should I focus on today?",
  "Quiz me on my latest lecture.",
  "What assignments are coming up?",
  "Help me plan tonight.",
  "Explain this lecture concept.",
]

export function ChatPanel() {
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<CompanionMessage[]>([])
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState("")
  const logRef = useRef<HTMLDivElement>(null)
  const submittingRef = useRef(false)
  const optimisticSequence = useRef(0)

  useEffect(() => {
    getLatestCompanionConversation()
      .then(({ conversation, messages: stored }) => {
        setConversationId(conversation?.id || null)
        setMessages(stored)
      })
      .catch(() =>
        setError("Pathly couldn't load this conversation. Try refreshing."),
      )
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => {
    logRef.current?.scrollTo({
      top: logRef.current.scrollHeight,
      behavior: "smooth",
    })
  }, [messages, sending])

  const send = async () => {
    const text = message.trim()
    if (!text || submittingRef.current) return
    submittingRef.current = true
    const localId = `pending-${++optimisticSequence.current}`
    const optimistic: CompanionMessage = {
      id: localId,
      conversation_id: conversationId || "pending",
      user_id: "current",
      request_id: "pending",
      role: "user",
      content: text,
      sources: [],
      metadata: {},
      created_at: new Date().toISOString(),
    }
    setMessage("")
    setError("")
    setSending(true)
    setMessages((current) => [...current, optimistic])
    try {
      const result = await sendCompanionMessage({
        conversationId,
        message: text,
      })
      setConversationId(result.conversation.id)
      setMessages((current) => [
        ...current.filter((item) => item.id !== localId),
        result.userMessage,
        result.message,
      ])
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
      <div className="chat-log" ref={logRef} aria-live="polite">
        {loading && <p className="chat-status">Loading your conversation...</p>}
        {!loading && !messages.length && (
          <div className="chat-welcome">
            <h3>What can Pathly help you work through?</h3>
            <p>
              Ask about your saved courses, upcoming work, study plan, or
              processed lecture materials.
            </p>
          </div>
        )}
        {messages.map((item) => (
          <div
            className={`message ${
              item.role === "user" ? "from-user" : "from-pathly"
            }`}
            key={item.id}
          >
            <div className="message-label">
              {item.role === "user" ? "You" : "Pathly"}
            </div>
            <p>{item.content}</p>
            {!!item.sources?.length && (
              <div className="message-sources">
                <strong>Sources</strong>
                {item.sources.map((source) => (
                  <span key={`${item.id}-${source.label}`}>{source.label}</span>
                ))}
              </div>
            )}
            {!!item.metadata?.things_to_double_check?.length && (
              <div className="double-check">
                <strong>Things to double-check</strong>
                <ul>
                  {item.metadata.things_to_double_check.map((check) => (
                    <li key={check}>{check}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
        {sending && (
          <p className="chat-status">
            Pathly is reviewing the relevant details...
          </p>
        )}
      </div>
      <div className="suggestions">
        {prompts.map((prompt) => (
          <button
            disabled={sending}
            key={prompt}
            onClick={() => setMessage(prompt)}
          >
            {prompt}
          </button>
        ))}
      </div>
      {error && (
        <p className="chat-error" role="alert">
          {error}
        </p>
      )}
      <div className="chat-input">
        <input
          maxLength={2000}
          value={message}
          disabled={loading || sending}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              void send()
            }
          }}
          placeholder="Ask Pathly about your studies..."
          aria-label="Message Pathly Companion"
        />
        <button
          disabled={loading || sending || !message.trim()}
          onClick={() => void send()}
          aria-label="Send message"
        >
          <Icon name="send" />
        </button>
      </div>
    </section>
  )
}
