import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { API } from '../api'

function getRiskColor(level) {
  if (level === 'HIGH') return 'var(--risk-high)'
  if (level === 'MEDIUM') return 'var(--risk-medium)'
  if (level === 'LOW') return 'var(--risk-low)'
  return 'var(--text-muted)'
}

function getAvatarClass(level) {
  if (level === 'HIGH') return 'avatar-high'
  if (level === 'MEDIUM') return 'avatar-medium'
  if (level === 'LOW') return 'avatar-low'
  return 'avatar-unknown'
}

function getInitials(name) {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
}

function FeeTag({ status }) {
  const map = { paid: ['✅', 'fee-paid', 'Paid'], pending: ['⏳', 'fee-pending', 'Pending'], overdue: ['🔴', 'fee-overdue', 'Overdue'] }
  const [icon, cls, label] = map[status] || ['❓', '', status]
  return <span className={cls} style={{ fontSize: 13, fontWeight: 600 }}>{icon} {label}</span>
}

export default function Dashboard() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('ALL')
  const navigate = useNavigate()

  useEffect(() => {
    axios.get(`${API}/dashboard`).then((r) => { setData(r.data); setLoading(false) })
  }, [])

  if (loading) return (
    <div>
      <div className="page-header">
        <div className="page-title">🏫 Class Overview</div>
        <div className="page-subtitle">Loading student data...</div>
      </div>
      <div className="loading-spinner" />
    </div>
  )

  const filtered = data.students.filter((s) => filter === 'ALL' || s.risk_level === filter)

  return (
    <div>
      <div className="page-header">
        <div className="page-title">🏫 Class Overview</div>
        <div className="page-subtitle">
          Monitoring {data.total_students} students — updated just now
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total Students</div>
          <div className="stat-value total">{data.total_students}</div>
          <div className="stat-sub">Under active monitoring</div>
        </div>
        <div className="stat-card" style={{ borderColor: data.high_risk > 0 ? 'var(--risk-high-border)' : '' }}>
          <div className="stat-label">🔴 High Risk</div>
          <div className="stat-value high">{data.high_risk}</div>
          <div className="stat-sub">Need immediate action</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">🟡 Medium Risk</div>
          <div className="stat-value medium">{data.medium_risk}</div>
          <div className="stat-sub">Require close watch</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">🟢 Low Risk</div>
          <div className="stat-value low">{data.low_risk}</div>
          <div className="stat-sub">On track</div>
        </div>
      </div>

      {/* Warning Banner for HIGH RISK */}
      {data.high_risk > 0 && (
        <div className="alert-box high" style={{ marginBottom: 24 }}>
          <div className="alert-title">⚠️ Immediate Attention Required</div>
          <div className="alert-body">
            {data.high_risk} student{data.high_risk > 1 ? 's are' : ' is'} at HIGH dropout risk. 
            AI-generated intervention plans are ready. Click any red student card to view details and take action.
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {['ALL', 'HIGH', 'MEDIUM', 'LOW'].map((f) => (
          <button
            key={f}
            className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setFilter(f)}
          >
            {f === 'HIGH' ? '🔴' : f === 'MEDIUM' ? '🟡' : f === 'LOW' ? '🟢' : ''}  {f}
            {f !== 'ALL' && (
              <span style={{
                background: 'rgba(255,255,255,0.15)',
                borderRadius: 10,
                padding: '1px 7px',
                fontSize: 11,
                marginLeft: 4,
              }}>
                {f === 'HIGH' ? data.high_risk : f === 'MEDIUM' ? data.medium_risk : data.low_risk}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Student Cards */}
      <div className="students-grid">
        {filtered.map((student) => (
          <div
            key={student.student_id}
            className={`student-card ${student.risk_level} ${student.risk_level === 'HIGH' ? 'pulse-high' : ''}`}
            onClick={() => navigate(`/student/${student.student_id}`)}
          >
            <div className="student-card-top">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div className={`student-avatar ${getAvatarClass(student.risk_level)}`}>
                  {getInitials(student.name)}
                </div>
                <div>
                  <div className="student-name">{student.name}</div>
                  <div className="student-grade">Grade {student.grade} &nbsp;·&nbsp; Roll #{student.student_id}</div>
                </div>
              </div>
              <span className={`risk-badge ${student.risk_level}`}>
                {student.risk_level === 'HIGH' ? '🔴' : student.risk_level === 'MEDIUM' ? '🟡' : '🟢'} {student.risk_level}
              </span>
            </div>

            {/* Metrics */}
            <div className="student-metrics">
              <div className="metric-item">
                <div className="metric-value" style={{ color: student.attendance_rate < 65 ? 'var(--risk-high)' : student.attendance_rate < 80 ? 'var(--risk-medium)' : 'var(--risk-low)' }}>
                  {student.attendance_rate}%
                </div>
                <div className="metric-label">Attendance</div>
              </div>
              <div className="metric-item">
                <div className="metric-value" style={{ color: student.avg_score < 40 ? 'var(--risk-high)' : student.avg_score < 60 ? 'var(--risk-medium)' : 'var(--risk-low)' }}>
                  {student.avg_score}%
                </div>
                <div className="metric-label">Avg Score</div>
              </div>
              <div className="metric-item">
                <div className="metric-value">
                  <FeeTag status={student.fee_status} />
                </div>
                <div className="metric-label">Fees</div>
              </div>
            </div>

            {/* Risk Score Bar */}
            <div className="risk-score-bar">
              <div className="risk-bar-label">
                <span>Risk Score</span>
                <span style={{ color: getRiskColor(student.risk_level), fontWeight: 700 }}>
                  {student.risk_score}/100
                </span>
              </div>
              <div className="risk-bar-track">
                <div
                  className="risk-bar-fill"
                  style={{
                    width: `${student.risk_score}%`,
                    background: getRiskColor(student.risk_level),
                  }}
                />
              </div>
            </div>

            <div style={{ marginTop: 14, fontSize: 12, color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
              <span>Click to view details & AI analysis</span>
              <span>→</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
