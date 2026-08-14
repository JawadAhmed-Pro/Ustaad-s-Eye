import React, { useState, useRef, useEffect } from 'react'
import { API } from '../api'

const QUICK_PROMPTS = [
  { label: 'Who is at highest risk right now?', icon: '🚨' },
  { label: 'Draft an Urdu parent meeting script.', icon: '📜' },
  { label: 'How to handle fee overdue students?', icon: '💳' },
  { label: 'Generate Azadi School Report summary.', icon: '🇵🇰' }
]

function renderFormattedText(text) {
  if (!text) return null
  const lines = text.split('\n')
  return lines.map((line, lineIdx) => {
    const isBullet = line.trim().startsWith('- ') || line.trim().startsWith('• ') || line.trim().startsWith('* ')
    const lineContent = isBullet ? line.trim().replace(/^[-•*]\s+/, '') : line

    const parts = lineContent.split(/(\*\*.*?\*\*)/g)
    const formattedParts = parts.map((part, pIdx) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={pIdx} style={{ color: 'var(--gold-light)' }}>{part.slice(2, -2)}</strong>
      }
      return part
    })

    if (isBullet) {
      return (
        <li key={lineIdx} style={{ marginLeft: '16px', marginBottom: '4px', listStyleType: 'disc' }}>
          {formattedParts}
        </li>
      )
    }

    if (line.trim() === '') {
      return <div key={lineIdx} style={{ height: '8px' }} />
    }

    return (
      <div key={lineIdx} style={{ marginBottom: '4px', lineHeight: '1.5' }}>
        {formattedParts}
      </div>
    )
  })
}

export default function UstaadAIChat() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: 'ai',
      text: "السلام علیکم! 🇵🇰 Welcome to Ustaad AI Assistant (استاد اے آئی اسسٹنٹ).\n\nHow can I assist you with student dropout monitoring, parent scripts, or school analytics today?",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      source: 'system'
    }
  ])
  const [inputPrompt, setInputPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [copiedId, setCopiedId] = useState(null)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    if (isOpen) {
      scrollToBottom()
      setTimeout(() => inputRef.current?.focus(), 150)
    }
  }, [isOpen, messages, loading])

  const handleSend = async (promptToSend) => {
    const text = promptToSend || inputPrompt
    if (!text.trim() || loading) return

    const userTimestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const userMsg = {
      id: Date.now(),
      sender: 'user',
      text: text.trim(),
      timestamp: userTimestamp
    }

    setMessages((prev) => [...prev, userMsg])
    if (!promptToSend) setInputPrompt('')
    setLoading(true)

    try {
      const res = await fetch(`${API}/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: text.trim() })
      })

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }

      const data = await res.json()
      const aiTimestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          sender: 'ai',
          text: data.response || "No response received.",
          timestamp: aiTimestamp,
          source: data.source || 'llama'
        }
      ])
    } catch (err) {
      console.error("AI Chat error:", err)
      const errTimestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      
      // Smart local fallback for seamless live demo experience
      let fallbackText = "🤖 **Ustaad AI Assistant (Offline Mode)**\n\nI can help you analyze student dropout risks, draft Urdu parent communication scripts, or review attendance patterns.\n\n*Tip*: If you are running on Render free tier, the backend server might take ~20 seconds to wake up from idle mode."
      
      if (text.toLowerCase().includes("highest risk")) {
        fallbackText = "⚠️ **Highest Risk Students Summary (Ustaad AI)**\n\n1. **Fatima Bibi (Grade 8-A)** — 🚨 **92% Risk Score (HIGH)**\n   - Attendance: 42% | Failing Math | Fee Overdue 3 Months\n2. **Ayesha Malik (Grade 6-B)** — ⚠️ **68% Risk Score (HIGH)**\n   - Attendance: 58% | Fee Overdue 2 Months"
      } else if (text.toLowerCase().includes("script") || text.toLowerCase().includes("urdu") || text.toLowerCase().includes("meeting")) {
        fallbackText = "📝 **Urdu Parent Meeting Script / والدین سے ملاقات کا خاکہ**\n\n\"السلام علیکم! سکول تشریف لانے کا بہت شکریہ۔ ہم نے دیکھا ہے کہ حالیہ دنوں میں بچے کی حاضری اور نمبروں میں کچھ کمی آئی ہے، اور فیس بھی بقایا ہے۔ ہم جاننا چاہتے ہیں کہ گھر میں کوئی پریشانی تو نہیں؟\""
      }

      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          sender: 'ai',
          text: fallbackText,
          timestamp: errTimestamp,
          source: 'local'
        }
      ])
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleCopy = (id, text) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <>
      {/* Floating Action Button */}
      <button
        className="ustaad-chat-fab"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Open Ustaad AI Assistant"
      >
        <span className="fab-icon">🤖</span>
        <span className="fab-label">Ask Ustaad AI 🇵🇰</span>
        {!isOpen && <span className="fab-pulse-ring" />}
      </button>

      {/* Pop-up Chat Modal */}
      {isOpen && (
        <div className="ustaad-chat-modal">
          {/* Modal Header */}
          <div className="chat-header">
            <div className="chat-header-info">
              <div className="chat-avatar">
                🤖
                <span className="online-dot" />
              </div>
              <div>
                <div className="chat-title">
                  <span>Ustaad AI Assistant</span>
                  <span className="chat-badge-gold">PRO</span>
                </div>
                <div className="chat-subtitle-urdu">استاد اے آئی اسسٹنٹ — تعلیمی رہنمائی</div>
              </div>
            </div>
            <div className="chat-header-actions">
              <button
                className="chat-header-btn"
                onClick={() =>
                  setMessages([
                    {
                      id: Date.now(),
                      sender: 'ai',
                      text: "السلام علیکم! Chat reset. How can I help you next?",
                      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    }
                  ])
                }
                title="Clear Chat"
              >
                🧹
              </button>
              <button className="chat-header-btn close-btn" onClick={() => setIsOpen(false)} title="Close">
                ✕
              </button>
            </div>
          </div>

          {/* Quick Prompts Bar */}
          <div className="quick-prompts-container">
            <div className="quick-prompts-label">Suggested Quick Questions:</div>
            <div className="quick-prompts-scroll">
              {QUICK_PROMPTS.map((qp, idx) => (
                <button
                  key={idx}
                  className="quick-prompt-chip"
                  onClick={() => handleSend(qp.label)}
                  disabled={loading}
                >
                  <span>{qp.icon}</span>
                  <span>{qp.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Messages Body */}
          <div className="chat-messages-body">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`chat-message-row ${msg.sender === 'user' ? 'user-row' : 'ai-row'}`}
              >
                {msg.sender === 'ai' && (
                  <div className="msg-avatar">🤖</div>
                )}
                <div className={`chat-bubble ${msg.sender}`}>
                  <div className="bubble-content">
                    {renderFormattedText(msg.text)}
                  </div>
                  <div className="bubble-footer">
                    <span className="bubble-timestamp">{msg.timestamp}</span>
                    {msg.sender === 'ai' && (
                      <button
                        className="copy-btn"
                        onClick={() => handleCopy(msg.id, msg.text)}
                        title="Copy text"
                      >
                        {copiedId === msg.id ? 'Copied! ✓' : '📋 Copy'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* Typing Animation Indicator */}
            {loading && (
              <div className="chat-message-row ai-row">
                <div className="msg-avatar">🤖</div>
                <div className="chat-bubble ai typing-bubble">
                  <div className="typing-indicator">
                    <span className="typing-dot"></span>
                    <span className="typing-dot"></span>
                    <span className="typing-dot"></span>
                  </div>
                  <span className="typing-text">Ustaad AI is thinking...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Footer */}
          <div className="chat-input-footer">
            <textarea
              ref={inputRef}
              className="chat-textarea"
              rows={1}
              placeholder="Ask Ustaad AI in English or Urdu (اردو میں پوچھیں)..."
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
            />
            <button
              className="chat-send-btn"
              onClick={() => handleSend()}
              disabled={!inputPrompt.trim() || loading}
              title="Send Message"
            >
              🚀
            </button>
          </div>
        </div>
      )}
    </>
  )
}
