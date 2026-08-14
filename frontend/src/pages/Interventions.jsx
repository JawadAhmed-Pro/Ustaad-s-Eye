import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useToast } from '../App'
import { API } from '../api'

function InterventionCard({ item, onAction, onViewStudent }) {
  const [expanded, setExpanded] = useState(false)

  const riskColors = {
    HIGH: { bg: 'var(--risk-high-bg)', border: 'var(--risk-high-border)', color: 'var(--risk-high)' },
    MEDIUM: { bg: 'var(--risk-medium-bg)', border: 'var(--risk-medium-border)', color: 'var(--risk-medium)' },
    LOW: { bg: 'var(--risk-low-bg)', border: 'var(--risk-low-border)', color: 'var(--risk-low)' },
  }

  const colors = riskColors[item.risk_level] || riskColors.LOW

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: `1px solid ${item.actioned ? 'var(--border)' : colors.border}`,
      borderRadius: 'var(--radius-lg)',
      padding: 20,
      opacity: item.actioned ? 0.7 : 1,
      transition: 'all 0.2s',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span className={`risk-badge ${item.risk_level}`}>
              {item.risk_level === 'HIGH' ? '🔴' : item.risk_level === 'MEDIUM' ? '🟡' : '🟢'} {item.risk_level}
            </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
              {item.student_name}
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Grade {item.student_grade}</span>
            {item.actioned && (
              <span className="tag" style={{ background: 'var(--risk-low-bg)', color: 'var(--risk-low)', border: '1px solid var(--risk-low-border)' }}>
                ✅ Actioned
              </span>
            )}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {item.risk_explanation}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
            Generated: {new Date(item.created_at).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            &nbsp;·&nbsp; Risk Score: <strong style={{ color: colors.color }}>{item.risk_score}/100</strong>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => onViewStudent(item.student_id)}>
            👁️ View Student
          </button>
          {!item.actioned && item.risk_level !== 'LOW' && (
            <button className="btn btn-success btn-sm" onClick={() => onAction(item.id)}>
              ✅ Mark Actioned
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => setExpanded(!expanded)}>
            {expanded ? '▲ Hide' : '▼ View Plan'}
          </button>
        </div>
      </div>

      {expanded && item.risk_level !== 'LOW' && (
        <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {item.parent_sms && (
            <div className="intervention-tab">
              <div className="intervention-tab-title">📱 Parent SMS</div>
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div className="page-title">⚠️ Interventions</div>
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
          { id: 'MEDIUM', label: '🟡 Medium Risk' },
          { id: 'ACTIONED', label: '✅ Actioned' },
        ].map((f) => (
          <button
            key={f.id}
            className={`btn btn-sm ${filter === f.id ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading-spinner" />
      ) : filtered.length === 0 ? (
        <div className="empty-state">
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
