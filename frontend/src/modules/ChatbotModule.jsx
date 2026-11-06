import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { chatAPI } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

const genId = () => Math.random().toString(36).slice(2) + Date.now().toString(36)

const QUICK_EN = [
  'How do I identify cassava brown streak disease?',
  'What fertilizer is best for maize in rainy season?',
  'How do I control fall armyworm on maize?',
  'What is the best crop for Bo district laterite soil?',
]
const QUICK_KR = [
  'How for know if mi kasava get sickness?',
  'Which fertilizer best for kohn for rainy season?',
  'How for kill fall armyworm for kohn?',
  'Which crop best for laterite soil for Bo district?',
]

function Message({ msg }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'} animate-slide-up`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 font-bold ${
        isUser ? 'bg-leaf text-white' : 'bg-bark text-gold-light'
      }`}>
        {isUser ? '👤' : '🌿'}
      </div>
      <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
        isUser
          ? 'bg-leaf text-white rounded-tr-sm'
          : 'bg-white border border-sand text-bark rounded-tl-sm shadow-sm'
      }`}>
        <p className="whitespace-pre-wrap">{msg.content}</p>
        <p className={`text-xs mt-1.5 ${isUser ? 'text-white/60' : 'text-agri-muted'}`}>
          {format(new Date(msg.created_at || Date.now()), 'HH:mm')}
        </p>
      </div>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 rounded-full bg-bark flex items-center justify-center text-gold-light text-sm">🌿</div>
      <div className="bg-white border border-sand rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
        <div className="flex gap-1 items-center h-4">
          {[0, 1, 2].map(i => (
            <div key={i} className="w-1.5 h-1.5 rounded-full bg-agri-muted animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      </div>
    </div>
  )
}

export default function ChatbotModule() {
  const { i18n } = useTranslation()
  const { user } = useAuth()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [sessionId] = useState(genId)
  // Chat language defaults to user's preferred language
  const [chatLang, setChatLang] = useState('en')
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    const welcome = chatLang === 'kr'
      ? `Ello! A na SmartAgri AI Helper.\n\nA fit help yu wit:\n🌿 Plant sickness check\n🌾 Which crop for plant\n🧪 Fertilizer advice\n⚠️ Pest and disease\n📱 How for use SmartAgri\n\nAsk me anyting bout farming for Sierra Leone!`
      : `Hello${user?.full_name ? ` ${user.full_name.split(' ')[0]}` : ''}! I'm the SmartAgri AI Farming Assistant.\n\nI can help you with:\n🌿 Plant disease identification & treatment\n🌾 Crop selection for your soil & location\n🧪 Fertilizer recommendations\n⚠️ Pest control strategies\n📱 How to use any SmartAgri module\n\nAsk me anything about farming in Sierra Leone!`

    setMessages([{ role: 'assistant', content: welcome, created_at: new Date().toISOString() }])
  }, [chatLang])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading])

  const sendMessage = async (text) => {
    const msg = (text || input).trim()
    if (!msg || loading) return
    setInput('')

    const userMsg = { role: 'user', content: msg, created_at: new Date().toISOString() }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    try {
      const res = await chatAPI.sendMessage({
        message: msg,
        session_id: sessionId,
        language: chatLang  // Always send the correct current language
      })
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: res.data.response,
        created_at: new Date().toISOString()
      }])
    } catch (err) {
      const errMsg = err.response?.data?.error || 'Could not reach AI. Please try again.'
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: errMsg,
        created_at: new Date().toISOString()
      }])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const toggleLang = () => setChatLang(l => l === 'en' ? 'kr' : 'en')

  const quickQs = chatLang === 'kr' ? QUICK_KR : QUICK_EN

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] animate-fade-in">
      <div className="mb-4">
        <div className="section-tag">AI Assistant</div>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-serif text-2xl text-bark font-bold">SmartAgri AI Assistant</h1>
            <p className="text-agri-muted text-sm mt-1">Ask any farming question in English or Krio</p>
          </div>
          <button onClick={toggleLang} className="btn-ghost text-xs flex-shrink-0">
            {chatLang === 'en' ? '🇸🇱 Switch to Krio' : '🇬🇧 Switch to English'}
          </button>
        </div>
      </div>

      {messages.length <= 1 && (
        <div className="mb-4">
          <p className="text-xs text-agri-muted mb-2 font-medium uppercase tracking-wide">Quick questions</p>
          <div className="flex gap-2 flex-wrap">
            {quickQs.map(q => (
              <button key={q} onClick={() => sendMessage(q)}
                className="text-xs bg-white border border-sand rounded-full px-3 py-1.5 text-agri-muted hover:border-leaf hover:text-leaf transition-all">
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto card p-4 space-y-4 min-h-0">
        {messages.map((msg, i) => <Message key={i} msg={msg} />)}
        {loading && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>

      <div className="mt-3 flex gap-2">
        <textarea
          ref={inputRef}
          rows={1}
          className="flex-1 input resize-none py-3 min-h-[48px] max-h-28"
          placeholder={chatLang === 'kr' ? 'Ask bout farming for Krio...' : 'Ask about diseases, crops, fertilizer, or how to use SmartAgri...'}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
        />
        <button onClick={() => sendMessage()} disabled={!input.trim() || loading}
          className="btn-primary px-5 flex-shrink-0 self-end py-3">
          {loading ? <span className="spinner" /> : '→'}
        </button>
      </div>
      <p className="text-xs text-agri-muted mt-1.5 text-center">
        {chatLang === 'kr' ? 'Responding in Krio' : 'Responding in English'} · Enter to send
      </p>
    </div>
  )
}
