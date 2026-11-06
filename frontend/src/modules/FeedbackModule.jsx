/**
 * FeedbackModule.jsx: sends to mohamed.shaw81756@njala.edu.sl
 */
import { useState } from 'react'
import api from '../services/api'
import toast from 'react-hot-toast'

export default function FeedbackModule() {
  const [form, setForm]     = useState({ name: '', email: '', subject: '', message: '' })
  const [loading, setLoading] = useState(false)
  const [sent, setSent]     = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.message.trim()) { toast.error('Please enter a message'); return }
    setLoading(true)
    try {
      await api.post('/api/feedback/send', form)
      toast.success('Feedback sent! Thank you.')
      setSent(true)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to send. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4 animate-fade-in">
        <div className="text-5xl">✅</div>
        <h2 className="font-serif text-2xl text-bark font-bold">Thank you!</h2>
        <p className="text-agri-muted text-center max-w-sm">
          Your feedback has been sent to the SmartAgri team. We read every message.
        </p>
        <button onClick={() => { setSent(false); setForm({ name:'',email:'',subject:'',message:'' }) }}
          className="btn-ghost">Send another message</button>
      </div>
    )
  }

  return (
    <div className="space-y-5 animate-fade-in max-w-xl mx-auto">
      <div>
        <div className="section-tag">Contact Us</div>
        <h1 className="font-serif text-2xl text-bark font-bold">Send Feedback</h1>
        <p className="text-agri-muted text-sm mt-1">
          Your feedback goes directly to the SmartAgri team.
        </p>
      </div>
      <div className="card p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Your Name</label>
              <input className="input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Mohamed Kamara" />
            </div>
            <div>
              <label className="label">Email (optional)</label>
              <input type="email" className="input" value={form.email} onChange={e => set('email', e.target.value)} placeholder="you@example.com" />
            </div>
          </div>
          <div>
            <label className="label">Subject</label>
            <input className="input" value={form.subject} onChange={e => set('subject', e.target.value)} placeholder="e.g. Bug report, Feature request" />
          </div>
          <div>
            <label className="label">Message *</label>
            <textarea className="input min-h-[120px] resize-none" value={form.message}
              onChange={e => set('message', e.target.value)}
              placeholder="Tell us what you think, what broke, or what you'd love to see..." />
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? <><span className="spinner" /> Sending...</> : '✉️ Send Feedback'}
          </button>
        </form>
        <p className="text-xs text-agri-muted mt-4 text-center">
          Messages sent to mohamed.shaw81756@njala.edu.sl
        </p>
      </div>
    </div>
  )
}
