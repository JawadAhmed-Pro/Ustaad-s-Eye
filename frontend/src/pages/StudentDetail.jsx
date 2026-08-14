import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, Title, Tooltip, Legend, Filler
} from 'chart.js'
import { Line, Bar } from 'react-chartjs-2'
import { useToast } from '../App'
import { API } from '../api'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler)

const chartDefaults = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: '#0a2016',
      borderColor: 'rgba(255,255,255,0.12)',
      borderWidth: 1,
      titleColor: '#ffffff',
      bodyColor: '#cbd5e1',
    },
  },
  scales: {
    x: {
      grid: { color: 'rgba(255,255,255,0.06)' },
      ticks: { color: '#94a3b8', font: { size: 10 } },
    },
    y: {
      grid: { color: 'rgba(255,255,255,0.06)' },
      ticks: { color: '#94a3b8', font: { size: 10 } },
    },
  },
}

function getRiskColor(level) {
  if (level === 'HIGH') return 'var(--risk-high)'
  if (level === 'MEDIUM') return 'var(--gold)'
  if (level === 'LOW') return 'var(--accent-light)'
  return 'var(--text-muted)'
}

function AttendanceChart({ data }) {
  // Weekly attendance rate
  const byWeek = []
  const sorted = [...data].sort((a, b) => new Date(a.date) - new Date(b.date))
  for (let i = 0; i < sorted.length; i += 5) {
    const week = sorted.slice(i, i + 5)
    const rate = week.filter((d) => d.present).length / week.length * 100
    byWeek.push({ label: `W${Math.floor(i / 5) + 1}`, rate: Math.round(rate) })
  }

  const chartData = {
    labels: byWeek.map((w) => w.label),
    datasets: [{
      data: byWeek.map((w) => w.rate),
      borderColor: '#00A859',
      backgroundColor: 'rgba(0, 168, 89, 0.15)',
      fill: true,
      tension: 0.4,
      pointBackgroundColor: byWeek.map((w) => w.rate < 60 ? '#EF4444' : w.rate < 80 ? '#F59E0B' : '#00A859'),
      pointRadius: 5,
    }],
  }

  return (
    <div className="card">
      <div className="section-title" style={{ fontSize: 13, marginBottom: 12 }}>📅 Attendance Trend</div>
      <div className="chart-container">
        <Line data={chartData} options={{ ...chartDefaults, scales: { ...chartDefaults.scales, y: { ...chartDefaults.scales.y, min: 0, max: 100, ticks: { ...chartDefaults.scales.y.ticks, callback: (v) => v + '%' } } } }} />
      </div>
    </div>
  )
}

function ScoreChart({ data }) {
  const sorted = [...data].sort((a, b) => new Date(a.date) - new Date(b.date))
  const chartData = {
    labels: sorted.map((s) => s.subject.slice(0, 4)),
    datasets: [{
      data: sorted.map((s) => s.percentage),
      backgroundColor: sorted.map((s) => s.percentage < 40 ? 'rgba(239, 68, 68, 0.8)' : s.percentage < 60 ? 'rgba(245, 158, 11, 0.8)' : 'rgba(0, 168, 89, 0.8)'),
      borderRadius: 6,
    }],
  }
  return (
    <div className="card">
      <div className="section-title" style={{ fontSize: 13, marginBottom: 12 }}>📝 Test Scores</div>
      <div className="chart-container">
        <Bar data={chartData} options={{ ...chartDefaults, scales: { ...chartDefaults.scales, y: { ...chartDefaults.scales.y, min: 0, max: 100, ticks: { ...chartDefaults.scales.y.ticks, callback: (v) => v + '%' } } } }} />
      </div>
    </div>
  )
}

function FeeChart({ data }) {
  const statusMap = { paid: 3, pending: 2, overdue: 1 }
  const colorMap = { paid: '#00A859', pending: '#F59E0B', overdue: '#EF4444' }
  const chartData = {
    labels: data.map((f) => `${f.month.slice(0, 3)} ${f.year}`),
    datasets: [{
      data: data.map((f) => statusMap[f.status] || 0),
      backgroundColor: data.map((f) => colorMap[f.status] || '#94a3b8'),
      borderRadius: 6,
    }],
  }
  const opts = {
    ...chartDefaults,
    scales: {
      ...chartDefaults.scales,
      y: {
        ...chartDefaults.scales.y,
        min: 0, max: 3,
        ticks: { ...chartDefaults.scales.y.ticks, callback: (v) => ['', 'Overdue', 'Pending', 'Paid'][v] || '' },
      },
    },
  }
  return (
    <div className="card">
      <div className="section-title" style={{ fontSize: 13, marginBottom: 12 }}>💰 Fee Payment</div>
      <div className="chart-container">
        <Bar data={chartData} options={opts} />
      </div>
    </div>
  )
}

export default function StudentDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)

  // Simulation Sliders State
  const [simAttendance, setSimAttendance] = useState(100)
  const [simScore, setSimScore] = useState(100)
  const [simFeeOverdue, setSimFeeOverdue] = useState(0)
  const [simResult, setSimResult] = useState(null)
  const [simLoading, setSimLoading] = useState(false)

  const load = () => {
    setLoading(true)
    axios.get(`${API}/students/${id}/history`).then((r) => { 
      setData(r.data)
      setLoading(false)
    })
  }

  useEffect(() => { load() }, [id])

  useEffect(() => {
    if (data?.metrics) {
      const att = data.metrics.attendance_rate ?? 100
      const sc = data.metrics.avg_score ?? 100
      const fee = data.metrics.fee_overdue_months ?? 0
      setSimAttendance(att)
      setSimScore(sc)
      setSimFeeOverdue(fee)
      runLiveSimulation(att, sc, fee)
    }
  }, [data])

  const runLiveSimulation = async (att, score, fee) => {
    setSimLoading(true)
    try {
      const res = await axios.post(`${API}/ai/simulate`, {
        attendance_rate: Number(att),
        avg_score: Number(score),
        fee_overdue_months: Number(fee),
      })
      setSimResult(res.data)
    } catch (e) {
      console.error("Simulation error:", e)
    } finally {
      setSimLoading(false)
    }
  }

  const resetSliders = () => {
    if (data?.metrics) {
      const att = data.metrics.attendance_rate ?? 100
      const sc = data.metrics.avg_score ?? 100
      const fee = data.metrics.fee_overdue_months ?? 0
      setSimAttendance(att)
      setSimScore(sc)
      setSimFeeOverdue(fee)
      runLiveSimulation(att, sc, fee)
    }
  }

  const runAnalysis = async () => {
    setAnalyzing(true)
    try {
      await axios.post(`${API}/students/${id}/intervention`)
      load()
      toast('✅ AI analysis complete! Risk levels updated.', 'success')
    } catch (e) {
      toast('❌ Analysis failed. Check backend.', 'error')
    }
    setAnalyzing(false)
  }

  const actionIntervention = async (intId) => {
    await axios.patch(`${API}/interventions/${intId}/action`)
    load()
    toast('✅ Intervention marked as actioned!', 'success')
  }

  if (loading) return (
    <div>
      <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')} style={{ marginBottom: 20 }}>← Back to Dashboard</button>
      <div className="loading-spinner" />
    </div>
  )

  const { student, metrics, risk, attendance, scores, fees, latest_intervention } = data

  const riskColor = risk.risk_level === 'HIGH' ? 'var(--risk-high)' : risk.risk_level === 'MEDIUM' ? 'var(--gold)' : 'var(--accent-light)'

  return (
    <div>
      <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')} style={{ marginBottom: 20 }}>← Back to Dashboard</button>

      {/* Student Header */}
      <div className="card" style={{ marginBottom: 24, background: 'linear-gradient(135deg, var(--bg-card), var(--bg-secondary))' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{
              width: 60, height: 60, borderRadius: '50%',
              background: `linear-gradient(135deg, ${riskColor}, ${riskColor}88)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22, fontWeight: 800, color: 'white',
            }}>
              {student.name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)}
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{student.name}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 2 }}>
                Grade {student.grade} &nbsp;·&nbsp; Roll #{student.roll_number}
                {student.guardian_name && <> &nbsp;·&nbsp; 👨‍👩‍👧 {student.guardian_name}</>}
                {student.guardian_phone && <> &nbsp;·&nbsp; 📞 {student.guardian_phone}</>}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span className={`risk-badge ${risk.risk_level}`} style={{ fontSize: 14, padding: '8px 18px' }}>
              {risk.risk_level === 'HIGH' ? '🔴' : risk.risk_level === 'MEDIUM' ? '🌙' : '⭐'} {risk.risk_level} RISK
            </span>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: riskColor }}>{risk.risk_score}<span style={{ fontSize: 14 }}>/100</span></div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Risk Score</div>
            </div>
          </div>
        </div>

        {/* 3 key metrics */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 20 }}>
          {[
            { label: '📅 Attendance', value: `${metrics.attendance_rate}%`, bad: metrics.attendance_rate < 65 },
            { label: '📝 Avg Score', value: `${metrics.avg_score}%`, bad: metrics.avg_score < 50 },
            { label: '💰 Fee Overdue', value: `${metrics.fee_overdue_months} month${metrics.fee_overdue_months !== 1 ? 's' : ''}`, bad: metrics.fee_overdue_months > 0 },
          ].map((m) => (
            <div key={m.label} className="metric-item" style={{ padding: 16 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>{m.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: m.bad ? 'var(--risk-high)' : 'var(--accent-light)' }}>{m.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ⚡ Interactive Gemini AI Risk Simulator Card */}
      <div className="card" style={{ marginBottom: 24, border: '1px solid var(--gold)', background: 'linear-gradient(135deg, rgba(16, 45, 32, 0.95), rgba(10, 32, 22, 0.85))' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 24 }}>⚡</span>
            <div>
              <h3 style={{ fontSize: 18, fontWeight: 800, color: '#ffffff' }}>Interactive Gemini AI Risk Simulator</h3>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Drag sliders to dynamically simulate dropout risk level, risk score, and instant AI explanation
              </p>
            </div>
          </div>
          <span className="azadi-tag" style={{ background: 'var(--gold)', color: '#05140d' }}>
            LIVE AI SIMULATOR
          </span>
        </div>

        {/* Sliders Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20, marginBottom: 20 }}>
          {/* Attendance Slider */}
          <div className="sim-slider-group">
            <div className="sim-slider-header">
              <span>📅 Attendance Rate</span>
              <span className="sim-slider-value" style={{ color: simAttendance < 65 ? 'var(--risk-high)' : simAttendance < 80 ? 'var(--gold)' : 'var(--accent-light)' }}>
                {simAttendance}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={simAttendance}
              className="sim-slider"
              onChange={(e) => {
                const v = Number(e.target.value)
                setSimAttendance(v)
                runLiveSimulation(v, simScore, simFeeOverdue)
              }}
            />
          </div>

          {/* Test Score Slider */}
          <div className="sim-slider-group">
            <div className="sim-slider-header">
              <span>📝 Test Score (Avg)</span>
              <span className="sim-slider-value" style={{ color: simScore < 40 ? 'var(--risk-high)' : simScore < 60 ? 'var(--gold)' : 'var(--accent-light)' }}>
                {simScore}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={simScore}
              className="sim-slider"
              onChange={(e) => {
                const v = Number(e.target.value)
                setSimScore(v)
                runLiveSimulation(simAttendance, v, simFeeOverdue)
              }}
            />
          </div>

          {/* Fee Overdue Months Slider */}
          <div className="sim-slider-group">
            <div className="sim-slider-header">
              <span>💰 Fee Overdue Months</span>
              <span className="sim-slider-value" style={{ color: simFeeOverdue >= 3 ? 'var(--risk-high)' : simFeeOverdue >= 1 ? 'var(--gold)' : 'var(--accent-light)' }}>
                {simFeeOverdue} Month{simFeeOverdue !== 1 ? 's' : ''}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="6"
              step="1"
              value={simFeeOverdue}
              className="sim-slider"
              onChange={(e) => {
                const v = Number(e.target.value)
                setSimFeeOverdue(v)
                runLiveSimulation(simAttendance, simScore, v)
              }}
            />
          </div>
        </div>

        {/* Simulated Results Box */}
        {simResult && (
          <div style={{
            background: 'rgba(5, 20, 13, 0.75)',
            border: `1px solid ${getRiskColor(simResult.risk_level)}`,
            borderRadius: 'var(--radius)',
            padding: 18,
            position: 'relative'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className={`risk-badge ${simResult.risk_level}`} style={{ fontSize: 13 }}>
                  {simResult.risk_level === 'HIGH' ? '🔴' : simResult.risk_level === 'MEDIUM' ? '🌙' : '⭐'} SIMULATED {simResult.risk_level} RISK
                </span>
                {simLoading && <span style={{ fontSize: 12, color: 'var(--gold-light)' }}>⚡ Computing AI Simulation...</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Simulated Risk Score:</span>
                <span style={{ fontSize: 20, fontWeight: 800, color: getRiskColor(simResult.risk_level) }}>
                  {simResult.risk_score}/100
                </span>
              </div>
            </div>

            {/* Risk Score Track */}
            <div className="risk-bar-track" style={{ marginBottom: 14, height: 10 }}>
              <div
                className="risk-bar-fill"
                style={{
                  width: `${simResult.risk_score}%`,
                  background: getRiskColor(simResult.risk_level),
                }}
              />
            </div>

            {/* AI Explanation Text */}
            <div style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.6, marginBottom: 14 }}>
              🤖 <strong>Instant AI Explanation:</strong> {simResult.risk_explanation}
            </div>

            {/* Reset button */}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost btn-sm" onClick={resetSliders}>
                🔄 Reset Sliders to Actual Student Metrics
              </button>
            </div>
          </div>
        )}
      </div>

      {/* AI Risk Explanation */}
      {latest_intervention && (
        <div className={`alert-box ${latest_intervention.risk_level.toLowerCase()}`} style={{ marginBottom: 24 }}>
          <div className="alert-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <span>🤖 Gemini AI Risk Analysis</span>
            <span className="azadi-tag" style={{ fontSize: '10px' }}>🇵🇰 AZADI AI INSIGHT</span>
          </div>
          <div className="alert-body" style={{ marginTop: 8 }}>{latest_intervention.risk_explanation}</div>
          {latest_intervention.risk_level !== 'LOW' && !latest_intervention.actioned && (
            <button
              className="btn btn-ghost btn-sm"
              style={{ marginTop: 12 }}
              onClick={() => actionIntervention(latest_intervention.id)}
            >
              ✅ Mark as Actioned
            </button>
          )}
        </div>
      )}

      {/* Charts */}
      <div className="charts-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 18, marginBottom: 24 }}>
        {attendance.length > 0 && <AttendanceChart data={attendance} />}
        {scores.length > 0 && <ScoreChart data={scores} />}
        {fees.length > 0 && <FeeChart data={fees} />}
      </div>

      {/* Intervention Actions */}
      {latest_intervention && latest_intervention.risk_level !== 'LOW' && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="section-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span>📋 AI-Generated Intervention Plan</span>
              <span className="azadi-tag">AZADI ACTION PLAN</span>
            </div>
            {latest_intervention.actioned && (
              <span className="tag" style={{ background: 'var(--risk-low-bg)', color: 'var(--accent-light)', border: '1px solid var(--risk-low-border)', padding: '4px 10px', borderRadius: 12, fontSize: 12, fontWeight: 700 }}>
                ✅ Actioned
              </span>
            )}
          </div>

          <div className="intervention-tab">
            <div className="intervention-tab-title">📱 Parent SMS Draft</div>
            <div className="intervention-text" style={{ background: 'var(--bg-primary)', padding: 12, borderRadius: 8, fontFamily: 'monospace', fontSize: 13 }}>
              {latest_intervention.parent_sms}
            </div>
          </div>

          <div className="intervention-tab">
            <div className="intervention-tab-title">🚨 Counselor Alert</div>
            <div className="intervention-text">{latest_intervention.counselor_alert}</div>
          </div>

          <div className="intervention-tab">
            <div className="intervention-tab-title">📅 Meeting Agenda</div>
            <div className="intervention-text">{latest_intervention.meeting_agenda}</div>
          </div>
        </div>
      )}

      {/* Re-analyze button */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={runAnalysis} disabled={analyzing}>
          {analyzing ? '🤖 Analyzing...' : '🔄 Re-run AI Analysis'}
        </button>
        <button className="btn btn-ghost" onClick={() => navigate('/log')}>
          ✏️ Log New Entry
        </button>
      </div>
    </div>
  )
}
