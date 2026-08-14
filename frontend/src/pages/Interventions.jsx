import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useToast } from '../App'
import { API } from '../api'
import { cleanPhoneNumber } from '../utils/phone'

function InterventionCard({ item, onAction, onViewStudent }) {
  const [expanded, setExpanded] = useState(false)

  const riskColors = {
    HIGH: { bg: 'var(--risk-high-bg)', border: 'var(--risk-high-border)', color: 'var(--risk-high)' },
    MEDIUM: { bg: 'var(--risk-medium-bg)', border: 'var(--risk-medium-border)', color: 'var(--gold)' },
    LOW: { bg: 'var(--risk-low-bg)', border: 'var(--risk-low-border)', color: 'var(--accent-light)' },
  }

  const colors = riskColors[item.risk_level] || riskColors.LOW

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(16, 45, 32, 0.85), rgba(10, 32, 22, 0.95))',
      backdropFilter: 'blur(10px)',
      border: `1px solid ${item.actioned ? 'var(--border)' : (item.risk_level === 'HIGH' ? 'var(--risk-high-border)' : 'var(--gold)')}`,
      boxShadow: 'var(--shadow)',
      borderRadius: 'var(--radius-lg)',
      padding: 22,
      opacity: item.actioned ? 0.75 : 1,
      transition: 'all 0.25s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
            <span className={`risk-badge ${item.risk_level}`}>
              {item.risk_level === 'HIGH' ? '🔴' : item.risk_level === 'MEDIUM' ? '🌙' : '⭐'} {item.risk_level}
            </span>
            <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>
              {item.student_name}
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Grade {item.student_grade}</span>
            
            {item.actioned ? (
              <span style={{ background: 'var(--risk-low-bg)', color: 'var(--accent-light)', border: '1px solid var(--risk-low-border)', padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 800 }}>
                ✅ Actioned
              </span>
            ) : (
              <span style={{ background: 'var(--risk-medium-bg)', color: 'var(--gold)', border: '1px solid var(--risk-medium-border)', padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 800 }}>
                ⏳ Action Pending
              </span>
            )}
          </div>

          <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {item.risk_explanation}
          </div>

          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span>Generated: {new Date(item.created_at).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            <span>·</span>
            <span>Risk Score: <strong style={{ color: colors.color, fontSize: 13 }}>{item.risk_score}/100</strong></span>
            <span className="azadi-tag" style={{ fontSize: '10px' }}>🇵🇰 AZADI PLAN</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => onViewStudent(item.student_id)}>
            👁️ View Student
          </button>
          {!item.actioned && item.risk_level !== 'LOW' && (
            <button className="btn btn-gold btn-sm" onClick={() => onAction(item.id)}>
              ✅ Mark Actioned
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => setExpanded(!expanded)}>
            {expanded ? '▲ Hide Plan' : '▼ View AI Plan'}
          </button>
        </div>
      </div>

      {expanded && item.risk_level !== 'LOW' && (
        <div style={{ marginTop: 18, borderTop: '1px solid var(--border)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {item.parent_sms && (
            <div className="intervention-tab">
              <div className="intervention-tab-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <span>📱 Parent SMS</span>
                <button
                  className="btn btn-sm btn-success"
                  onClick={() => {
                    const phone = item.guardian_phone || ''
                    const cleanPhone = cleanPhoneNumber(phone)
                    const url = 'https://api.whatsapp.com/send?phone=' + cleanPhone + '&text=' + encodeURIComponent(item.parent_sms || '')
                    window.open(url, '_blank')
                  }}
                >
                  📲 Send WhatsApp to Guardian
                </button>
              </div>
              <div className="intervention-text" style={{ fontFamily: 'monospace', fontSize: 13, background: 'var(--bg-primary)', padding: 12, borderRadius: 8 }}>
                {item.parent_sms}
              </div>
            </div>
          )}
          {item.counselor_alert && (
            <div className="intervention-tab">
              <div className="intervention-tab-title">🚨 Counselor Alert</div>
              <div className="intervention-text">{item.counselor_alert}</div>
            </div>
          )}
          {item.meeting_agenda && (
            <div className="intervention-tab">
              <div className="intervention-tab-title">📅 Meeting Agenda</div>
              <div className="intervention-text">{item.meeting_agenda}</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function Interventions() {
  const [interventions, setInterventions] = useState([])
  const [students, setStudents] = useState({})
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('ALL')
  const navigate = useNavigate()
  const toast = useToast()

  const load = () => {
    setLoading(true)
    Promise.all([
      axios.get(`${API}/interventions`),
      axios.get(`${API}/students`),
    ]).then(([intRes, stuRes]) => {
      const stuMap = {}
      stuRes.data.forEach((s) => { stuMap[s.id] = s })
      setStudents(stuMap)
      const enriched = intRes.data.map((i) => ({
        ...i,
        student_name: stuMap[i.student_id]?.name || 'Unknown',
        student_grade: stuMap[i.student_id]?.grade || '?',
        guardian_phone: stuMap[i.student_id]?.guardian_phone || '0312-1234567',
      }))
      setInterventions(enriched)
      setLoading(false)
    })
  }

  useEffect(() => { load() }, [])

  const actionIntervention = async (id) => {
    await axios.patch(`${API}/interventions/${id}/action`)
    load()
    toast('✅ Intervention actioned!', 'success')
  }

  const filtered = interventions.filter((i) => {
    if (filter === 'ALL') return true
    if (filter === 'PENDING') return !i.actioned && i.risk_level !== 'LOW'
    if (filter === 'ACTIONED') return i.actioned
    return i.risk_level === filter
  })

  const pending = interventions.filter((i) => !i.actioned && i.risk_level !== 'LOW').length
  const high = interventions.filter((i) => i.risk_level === 'HIGH').length

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div className="page-title-row">
              <h1 className="page-title">⚠️ Interventions | Azadi Action Portal</h1>
              <span className="azadi-tag">JASHN-E-AZADI</span>
            </div>
            <div className="page-subtitle">AI-generated action plans for at-risk students</div>
          </div>
          {pending > 0 && (
            <div className="alert-box high" style={{ margin: 0, padding: '10px 16px' }}>
              <div className="alert-title" style={{ margin: 0 }}>🔔 {pending} pending action{pending !== 1 ? 's' : ''}</div>
            </div>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {[
          { id: 'ALL', label: 'All' },
          { id: 'PENDING', label: `🔔 Pending (${pending})` },
          { id: 'HIGH', label: `🔴 High Risk (${high})` },
          { id: 'MEDIUM', label: '🌙 Medium Risk' },
          { id: 'ACTIONED', label: '✅ Actioned' },
        ].map((f) => (
          <button
            key={f.id}
            className={`btn btn-sm ${filter === f.id ? (f.id === 'PENDING' ? 'btn-gold' : 'btn-primary') : 'btn-ghost'}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading-spinner" />
      ) : filtered.length === 0 ? (
        <div className="empty-state card">
          <div className="empty-icon">🎉</div>
          <div className="empty-title">No interventions to show</div>
          <div>All students are on track or interventions have been actioned.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {filtered.map((item) => (
            <InterventionCard
              key={item.id}
              item={item}
              onAction={actionIntervention}
              onViewStudent={(id) => navigate(`/student/${id}`)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

