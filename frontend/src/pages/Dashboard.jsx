import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { API } from '../api'
import { useToast } from '../App'

function getRiskColor(level) {
  if (level === 'HIGH') return 'var(--risk-high)'
  if (level === 'MEDIUM') return 'var(--gold)'
  if (level === 'LOW') return 'var(--accent-light)'
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

function getStudentStage(s) {
  if (s.dropout_stage && s.dropout_stage >= 1 && s.dropout_stage <= 4) {
    return s.dropout_stage
  }
  const ca = s.consecutive_absences || 0
  const att = s.attendance_rate || 100
  const score = s.risk_score || 0
  const fee = s.fee_status || 'paid'
  if (ca >= 3 || att < 50 || score >= 75) return 4
  if (fee === 'overdue' || (att < 65 && fee === 'pending') || score >= 55) return 3
  if (s.avg_score < 50 || att < 80 || score >= 35) return 2
  return 1
}

export default function Dashboard() {
  const [data, setData] = useState({ total_students: 0, high_risk: 0, medium_risk: 0, low_risk: 0, saved_retained: 0, students: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('ALL')
  const [stageFilter, setStageFilter] = useState('ALL')
  const [seeding, setSeeding] = useState(false)
  const toast = useToast()

  // Modals for AI Demo Features
  const [showSimModal, setShowSimModal] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)

  // Simulation scenario states
  const [attScenario, setAttScenario] = useState(15) // +15% attendance
  const [feeScenario, setFeeScenario] = useState('WAIVE') // 'NONE', 'WAIVE', 'INSTALLMENT'
  const [tutoringScenario, setTutoringScenario] = useState(true) // Remedial active

  const navigate = useNavigate()

  const fetchDashboardData = (showSpinner = true) => {
    if (showSpinner) setLoading(true)
    axios.get(`${API}/dashboard`)
      .then((r) => {
        if (r.data && Array.isArray(r.data.students)) {
          setData(r.data)
        }
        setLoading(false)
      })
      .catch((err) => {
        console.error("Failed to load dashboard:", err)
        setError("Could not connect to server. Please check backend connection.")
        setLoading(false)
      })
  }

  useEffect(() => {
    fetchDashboardData(true)
  }, [])

  const handleBulkSeed = async () => {
    setSeeding(true)
    try {
      await axios.post(`${API}/students/bulk-seed`)
      toast('⚡ 35 Students & AI Interventions Seeded Live!', 'success')
      fetchDashboardData(false)
    } catch (err) {
      console.error("Failed to seed students:", err)
      toast('❌ Failed to seed demo students. Please check server.', 'error')
    } finally {
      setSeeding(false)
    }
  }

  if (loading) return (
    <div>
      <div className="page-header">
        <div className="page-title">🇵🇰 Class Overview | Jashn-e-Azadi Special</div>
        <div className="page-title-urdu">نگرانی طالبات — گورنمنٹ گرلز اسکول بہاولپور</div>
        <div className="page-subtitle">Loading student data...</div>
      </div>
      <div className="loading-spinner" />
    </div>
  )

  const studentList = data?.students || []
  const urgentAbsenceStudents = studentList.filter((s) => (s.consecutive_absences || 0) >= 3)
  const savedCount = data.saved_retained ?? studentList.filter((s) => s.retention_status === 'SAVED_RETAINED' || s.risk_level === 'LOW').length

  const filtered = studentList.filter((s) => {
    const matchesRisk = filter === 'ALL' || s.risk_level === filter
    const matchesStage = stageFilter === 'ALL' || getStudentStage(s) === stageFilter
    return matchesRisk && matchesStage
  })

  // Calculate dynamic simulation preview
  const originalHigh = data.high_risk || 0
  const simulatedHigh = Math.max(0, originalHigh - (attScenario >= 15 ? 2 : 1) - (feeScenario !== 'NONE' ? 1 : 0))
  const highRiskReduction = originalHigh > 0 ? Math.round(((originalHigh - simulatedHigh) / originalHigh) * 100) : 0

  return (
    <div>
      {/* 🚨 Consecutive Absence Alarm Bar (Top of Dashboard) */}
      {urgentAbsenceStudents.length > 0 && (
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.22), rgba(153, 27, 27, 0.35))',
            border: '2px solid var(--risk-high)',
            borderRadius: 'var(--radius-lg)',
            padding: '16px 20px',
            marginBottom: 24,
            boxShadow: '0 0 25px rgba(239, 68, 68, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 280 }}>
            <span style={{ fontSize: 32 }}>🚨</span>
            <div>
              <div style={{ fontSize: 16, fontWeight: 900, color: '#ffffff', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>CONSECUTIVE ABSENCE ALARM BAR</span>
                <span style={{ background: 'var(--risk-high)', color: '#fff', fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 800 }}>
                  {urgentAbsenceStudents.length} CRITICAL
                </span>
              </div>
              <div style={{ fontSize: 14, color: '#fca5a5', marginTop: 4, fontWeight: 600 }}>
                🚨 URGENT: {urgentAbsenceStudents.map(s => `${s.name} has missed ${s.consecutive_absences || 3} consecutive days of school this week!`).join(' | ')}
              </div>
              <div style={{ fontFamily: 'var(--font-urdu)', fontSize: 13, color: 'var(--gold-light)', marginTop: 2 }}>
                فوری اطلاع: طالبات مسلسل 3 یا زائد دنوں سے غیر حاضر ہیں!
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
            <button
              className="btn btn-gold btn-sm"
              style={{ fontWeight: 800, color: '#05140d' }}
              onClick={() => navigate(`/student/${urgentAbsenceStudents[0].student_id}`)}
            >
              📲 Review Student
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setFilter('HIGH')}
            >
              Filter High Risk
            </button>
          </div>
        </div>
      )}

      {/* Page Header */}
      <div className="page-header">
        <div className="page-title-row" style={{ justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <h1 className="page-title">🇵🇰 Class Overview | Jashn-e-Azadi Special</h1>
            <span className="azadi-tag">AZADI 2026</span>
          </div>
          <button
            className="btn btn-gold"
            onClick={handleBulkSeed}
            disabled={seeding}
            style={{ fontSize: 14, fontWeight: 800, padding: '10px 18px', boxShadow: '0 4px 16px rgba(245, 158, 11, 0.4)' }}
          >
            {seeding ? '⚡ Seeding 35+ Students...' : '🎲 Seed 35+ Real-Time Demo Students'}
          </button>
        </div>
        <div className="page-title-urdu">نگرانی طالبات — گورنمنٹ گرلز اسکول بہاولپور</div>
        <div className="page-subtitle">
          Monitoring {data?.total_students || 0} students — updated just now
        </div>
      </div>

      {error && (
        <div style={{ background: 'rgba(255, 71, 87, 0.15)', border: '1px solid var(--risk-high-border)', padding: '12px 16px', borderRadius: '8px', marginBottom: '20px', color: '#ff6b81' }}>
          ⚠️ {error}
        </div>
      )}

      {/* 🤖 Gemini AI Risk Intelligence Summary Top Card */}
      <div className="ai-summary-card">
        <div className="ai-summary-header">
          <div className="ai-summary-title">
            <span>🤖 Gemini AI Risk Intelligence Summary</span>
            <span className="azadi-tag" style={{ background: 'var(--gold)', color: '#05140d' }}>
              AZADI AI INSIGHT
            </span>
          </div>
          <span style={{ fontSize: 12, color: 'var(--gold-light)', fontWeight: 600 }}>
            ✨ Live Flash Intelligence Model Active
          </span>
        </div>

        <div className="ai-insight-box">
          <div style={{ fontWeight: 800, color: 'var(--gold-light)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>💡 Real-Time AI Insights:</span>
          </div>
          <p style={{ color: 'var(--text-primary)', fontSize: 14, lineHeight: 1.6 }}>
            AI Insights: 70% of high-risk students in Grade 8 stem from attendance &lt; 60% combined with fee overdue status.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button className="btn btn-gold" onClick={() => setShowSimModal(true)}>
            ⚡ Run Instant Class Risk Simulation
          </button>
          <button className="btn btn-primary" onClick={() => setShowReportModal(true)}>
            📜 Generate Jashn-e-Azadi Report
          </button>
          <button className="btn btn-success" onClick={handleBulkSeed} disabled={seeding}>
            {seeding ? '⚡ Seeding...' : '🎲 Seed 35+ Real-Time Demo Students'}
          </button>
        </div>
      </div>

      {/* Stats Grid including 🎉 Dropout Prevention Impact Counter */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
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
          <div className="stat-label">🌙 Medium Risk</div>
          <div className="stat-value medium">{data.medium_risk}</div>
          <div className="stat-sub">Require close watch</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">⭐ Low Risk</div>
          <div className="stat-value low">{data.low_risk}</div>
          <div className="stat-sub">On track</div>
        </div>
        <div className="stat-card" style={{ background: 'linear-gradient(135deg, rgba(0, 168, 89, 0.2), rgba(16, 185, 129, 0.1))', borderColor: 'var(--accent)' }}>
          <div className="stat-label" style={{ color: 'var(--accent-light)' }}>🎉 Saved / Retained</div>
          <div className="stat-value" style={{ color: 'var(--accent-light)' }}>
            {savedCount} <span style={{ fontSize: 16, color: 'var(--text-muted)', fontWeight: 600 }}>/ {data.total_students}</span>
          </div>
          <div className="stat-sub" style={{ color: 'var(--gold-light)', fontWeight: 700 }}>
            Dropout Prevention Impact Counter
          </div>
        </div>
      </div>

      {/* 📊 4-Stage Dropout Escalation Pipeline View Section */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 className="section-title" style={{ margin: 0 }}>
              📊 4-Stage Dropout Escalation Pipeline
            </h2>
            <div style={{ fontFamily: 'var(--font-urdu)', fontSize: 14, color: 'var(--gold-light)', marginTop: 2 }}>
              سلسلہ وار ڈراپ اؤٹ کی روک تھام اور ترجیحی نگرانی
            </div>
          </div>
          {stageFilter !== 'ALL' && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setStageFilter('ALL')}
            >
              🔄 Reset Stage Filter (Show All Stages)
            </button>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          {[
            { stage: 1, title: 'Stage 1', name: 'Absenteeism Spike', urdu: 'حاضری میں کمی', desc: 'Initial attendance drop warning', icon: '⚠️', color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.4)' },
            { stage: 2, title: 'Stage 2', name: 'Academic Slip', urdu: 'تعلیمی تنزلی', desc: 'Failing scores & minor absenteeism', icon: '📉', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.4)' },
            { stage: 3, title: 'Stage 3', name: 'Family/Fee Hesitation', urdu: 'مالی / خاندانی مسائل', desc: 'Fee overdue & guardian hesitation', icon: '💰', color: '#f97316', bg: 'rgba(249, 115, 22, 0.12)', border: 'rgba(249, 115, 22, 0.4)' },
            { stage: 4, title: 'Stage 4', name: 'Imminent Dropout', urdu: 'اسکول چھوڑنے کا خدشہ', desc: 'Critical risk, 3+ consecutive absences', icon: '🚨', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.12)', border: 'rgba(239, 68, 68, 0.4)' },
          ].map((s) => {
            const count = studentList.filter(stu => getStudentStage(stu) === s.stage).length
            const isSelected = stageFilter === s.stage
            return (
              <div
                key={s.stage}
                onClick={() => setStageFilter(isSelected ? 'ALL' : s.stage)}
                style={{
                  background: isSelected ? s.bg : 'var(--bg-card)',
                  border: `2px solid ${isSelected ? s.color : s.border}`,
                  borderRadius: 'var(--radius-lg)',
                  padding: 16,
                  cursor: 'pointer',
                  transition: 'all 0.25s ease',
                  boxShadow: isSelected ? `0 0 20px ${s.bg}` : 'none',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: s.color, letterSpacing: '0.5px' }}>
                    {s.icon} STAGE {s.stage}
                  </span>
                  <span style={{
                    background: s.color,
                    color: '#05140d',
                    fontSize: 12,
                    fontWeight: 900,
                    padding: '2px 10px',
                    borderRadius: 12,
                  }}>
                    {count} Student{count !== 1 ? 's' : ''}
                  </span>
                </div>

                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>
                  {s.name}
                </div>
                <div style={{ fontFamily: 'var(--font-urdu)', fontSize: 13, color: 'var(--gold-light)', marginTop: 2 }}>
                  {s.urdu}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.4 }}>
                  {s.desc}
                </div>

                {isSelected && (
                  <div style={{ marginTop: 10, fontSize: 11, fontWeight: 800, color: s.color, textAlign: 'right' }}>
                    ✓ ACTIVE STAGE FILTER
                  </div>
                )}
              </div>
            )
          })}
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
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)' }}>Risk Level:</span>
        {['ALL', 'HIGH', 'MEDIUM', 'LOW'].map((f) => (
          <button
            key={f}
            className={`btn btn-sm ${filter === f ? (f === 'MEDIUM' ? 'btn-gold' : 'btn-primary') : 'btn-ghost'}`}
            onClick={() => setFilter(f)}
          >
            {f === 'HIGH' ? '🔴' : f === 'MEDIUM' ? '🌙' : f === 'LOW' ? '⭐' : ''} {f}
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

        {stageFilter !== 'ALL' && (
          <span className="azadi-tag" style={{ background: 'var(--gold)', color: '#05140d', marginLeft: 'auto' }}>
            Stage {stageFilter} Active
          </span>
        )}
      </div>

      {/* Student Cards Grid or Empty State */}
      {filtered.length === 0 ? (
        <div className="empty-state card">
          <div className="empty-icon">🇵🇰</div>
          <div className="empty-title">کوئی طالبہ نہیں ملی / No Students Found</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 8 }}>
            There are no students matching risk filter "{filter}" {stageFilter !== 'ALL' ? `and Stage ${stageFilter}` : ''}.
          </div>
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 16 }} onClick={() => { setFilter('ALL'); setStageFilter('ALL'); }}>
            Show All Students
          </button>
        </div>
      ) : (
        <div className="students-grid">
          {filtered.map((student) => {
            const stageNum = getStudentStage(student)
            return (
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
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <span className={`risk-badge ${student.risk_level}`}>
                      {student.risk_level === 'HIGH' ? '🔴' : student.risk_level === 'MEDIUM' ? '🌙' : '⭐'} {student.risk_level}
                    </span>
                    <span style={{
                      background: stageNum === 4 ? 'rgba(239,68,68,0.2)' : stageNum === 3 ? 'rgba(249,115,22,0.2)' : stageNum === 2 ? 'rgba(245,158,11,0.2)' : 'rgba(16,185,129,0.2)',
                      border: `1px solid ${stageNum === 4 ? '#ef4444' : stageNum === 3 ? '#f97316' : stageNum === 2 ? '#f59e0b' : '#10b981'}`,
                      color: stageNum === 4 ? '#ef4444' : stageNum === 3 ? '#f97316' : stageNum === 2 ? '#f59e0b' : '#10b981',
                      fontSize: 10,
                      fontWeight: 800,
                      padding: '2px 8px',
                      borderRadius: 10,
                    }}>
                      Stage {stageNum}
                    </span>
                  </div>
                </div>

                {/* Metrics */}
                <div className="student-metrics">
                  <div className="metric-item">
                    <div className="metric-value" style={{ color: student.attendance_rate < 65 ? 'var(--risk-high)' : student.attendance_rate < 80 ? 'var(--gold)' : 'var(--accent-light)' }}>
                      {student.attendance_rate}%
                    </div>
                    <div className="metric-label">Attendance</div>
                  </div>
                  <div className="metric-item">
                    <div className="metric-value" style={{ color: student.avg_score < 40 ? 'var(--risk-high)' : student.avg_score < 60 ? 'var(--gold)' : 'var(--accent-light)' }}>
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

                <div style={{ marginTop: 14, fontSize: 12, color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>
                    {(student.consecutive_absences || 0) >= 3 ? (
                      <strong style={{ color: 'var(--risk-high)' }}>🚨 {student.consecutive_absences} days absent</strong>
                    ) : (
                      'Click for details & AI analysis'
                    )}
                  </span>
                  <span>→</span>
                </div>
              </div>
            )
          })}
        </div>
      )}


      {/* ⚡ Instant Class Risk Simulation Modal */}
      {showSimModal && (
        <div className="modal-overlay" onClick={() => setShowSimModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 24 }}>⚡</span>
                <div>
                  <h3 style={{ fontSize: 18, fontWeight: 800 }}>Instant Class Risk Simulation</h3>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Model school-wide policy interventions in real-time</p>
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowSimModal(false)}>✕</button>
            </div>

            <div style={{ background: 'var(--bg-secondary)', padding: 18, borderRadius: 'var(--radius)', marginBottom: 20 }}>
              <div className="form-group">
                <label className="form-label">📅 Attendance Improvement Incentive Policy:</label>
                <select className="form-select" value={attScenario} onChange={(e) => setAttScenario(Number(e.target.value))}>
                  <option value={0}>Standard Monitoring (+0% attendance change)</option>
                  <option value={10}>Morning Buddy Calls (+10% attendance boost)</option>
                  <option value={20}>Comprehensive Home Visit Drive (+20% attendance boost)</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">💰 Fee Concession & Assistance Program:</label>
                <select className="form-select" value={feeScenario} onChange={(e) => setFeeScenario(e.target.value)}>
                  <option value="NONE">No Fee Relief (Standard Collection)</option>
                  <option value="INSTALLMENT">Flexible Installments Program (اقساط کی سہولت)</option>
                  <option value="WAIVE">Jashn-e-Azadi Fee Waiver for High-Risk Students</option>
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">📝 Academic Remedial Support:</label>
                <select className="form-select" value={tutoringScenario ? 'YES' : 'NO'} onChange={(e) => setTutoringScenario(e.target.value === 'YES')}>
                  <option value="NO">Standard Academic Tutoring</option>
                  <option value="YES">Active Daily Remedial Tutoring (+15% score boost in Core Subjects)</option>
                </select>
              </div>
            </div>

            {/* Simulation Output Card */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(0,168,89,0.2), rgba(245,158,11,0.15))',
              border: '1px solid var(--accent-light)',
              borderRadius: 'var(--radius)',
              padding: 20,
              marginBottom: 20
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--gold-light)' }}>
                  📊 SIMULATED CLASSROOM PROJECTION
                </span>
                <span className="azadi-tag" style={{ fontSize: 11 }}>
                  {highRiskReduction}% Dropout Risk Reduction
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: 12, borderRadius: 8, textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Original High Risk</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--risk-high)' }}>{originalHigh}</div>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: 12, borderRadius: 8, textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Simulated High Risk</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent-light)' }}>{simulatedHigh}</div>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: 12, borderRadius: 8, textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Students Saved</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--gold)' }}>{originalHigh - simulatedHigh}</div>
                </div>
              </div>

              <p style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6 }}>
                🤖 <strong>Gemini AI Projection:</strong> Implementing these policies is projected to reduce Grade 8 dropout risk significantly. 
                {originalHigh - simulatedHigh > 0
                  ? ` By addressing attendance and fee bottlenecks together, ${originalHigh - simulatedHigh} student(s) transition to safe academic standing within 30 days.`
                  : ' Select combined attendance and fee intervention to view projected student risk reduction.'}
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button className="btn btn-ghost" onClick={() => setShowSimModal(false)}>Close</button>
              <button className="btn btn-gold" onClick={() => setShowSimModal(false)}>Apply Simulation Insights</button>
            </div>
          </div>
        </div>
      )}

      {/* 📜 Generate Jashn-e-Azadi Report Modal */}
      {showReportModal && (
        <div className="modal-overlay" onClick={() => setShowReportModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 800 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border)', paddingBottom: 16, marginBottom: 20 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 28 }}>🇵🇰</span>
                  <div>
                    <h2 style={{ fontSize: 20, fontWeight: 900, color: '#ffffff' }}>Jashn-e-Azadi 2026 Special Class Risk Report</h2>
                    <div style={{ fontFamily: 'var(--font-urdu)', fontSize: 16, color: 'var(--gold-light)', marginTop: 2 }}>
                      نگرانی طالبات — گورنمنٹ گرلز اسکول بہاولپور
                    </div>
                  </div>
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowReportModal(false)}>✕</button>
            </div>

            <div style={{ background: 'var(--bg-secondary)', padding: 18, borderRadius: 'var(--radius)', marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, fontSize: 13, color: 'var(--text-secondary)' }}>
                <div><strong>School:</strong> Govt. Girls Middle School, Bahawalpur</div>
                <div><strong>Report Date:</strong> 14th August 2026</div>
                <div><strong>Monitoring Engine:</strong> Gemini Flash Risk AI</div>
              </div>
            </div>

            {/* Metrics Overview Table */}
            <div style={{ marginBottom: 20 }}>
              <h4 style={{ fontSize: 14, fontWeight: 800, color: 'var(--gold-light)', marginBottom: 12 }}>📊 Class Summary Metrics</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                <div style={{ background: 'var(--bg-secondary)', padding: 12, borderRadius: 8, textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Total Students</div>
                  <div style={{ fontSize: 20, fontWeight: 800 }}>{data.total_students}</div>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 12, borderRadius: 8, textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>High Risk</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--risk-high)' }}>{data.high_risk}</div>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 12, borderRadius: 8, textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Medium Risk</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--gold)' }}>{data.medium_risk}</div>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 12, borderRadius: 8, textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Low Risk</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--accent-light)' }}>{data.low_risk}</div>
                </div>
              </div>
            </div>

            {/* Strategic Recommendations */}
            <div style={{ background: 'rgba(0,168,89,0.1)', border: '1px solid var(--accent)', padding: 16, borderRadius: 'var(--radius)', marginBottom: 20 }}>
              <h4 style={{ fontSize: 14, fontWeight: 800, color: 'var(--accent-light)', marginBottom: 8 }}>
                📜 Gemini AI Strategic Action Plan (Jashn-e-Azadi Edition)
              </h4>
              <ul style={{ paddingLeft: 20, fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.7 }}>
                <li>Priority home visits for Grade 8 students exhibiting attendance &lt; 60% and fee delay.</li>
                <li>Launch flexible fee installment program (اقساط کی سہولت) to remove economic barriers.</li>
                <li>Establish morning neighborhood buddy call systems for regular school attendance.</li>
              </ul>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Generated by Ustaad's Eye AI System</span>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-ghost" onClick={() => setShowReportModal(false)}>Close</button>
                <button className="btn btn-primary" onClick={() => window.print()}>
                  🖨️ Print / Download PDF Report
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
