import React, { useEffect, useState, useRef } from 'react'
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
      backgroundColor: '#151b2d',
      borderColor: 'rgba(255,255,255,0.07)',
      borderWidth: 1,
      titleColor: '#e8eaf0',
      bodyColor: '#8892a4',
    },
  },
  scales: {
    x: {
      grid: { color: 'rgba(255,255,255,0.04)' },
      ticks: { color: '#4a5568', font: { size: 10 } },
    },
    y: {
      grid: { color: 'rgba(255,255,255,0.04)' },
      ticks: { color: '#4a5568', font: { size: 10 } },
    },
  },
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
      borderColor: '#6c63ff',
      backgroundColor: 'rgba(108,99,255,0.1)',
      fill: true,
      tension: 0.4,
      pointBackgroundColor: byWeek.map((w) => w.rate < 60 ? '#ff4757' : w.rate < 80 ? '#ffa502' : '#2ed573'),
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
      backgroundColor: sorted.map((s) => s.percentage < 40 ? 'rgba(255,71,87,0.7)' : s.percentage < 60 ? 'rgba(255,165,2,0.7)' : 'rgba(46,213,115,0.7)'),
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
  const colorMap = { paid: '#2ed573', pending: '#ffa502', overdue: '#ff4757' }
  const chartData = {
    labels: data.map((f) => `${f.month.slice(0, 3)} ${f.year}`),
    datasets: [{
      data: data.map((f) => statusMap[f.status] || 0),
      backgroundColor: data.map((f) => colorMap[f.status] || '#636e72'),
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
  const [generating, setGenerating] = useState(false)

  const load = () => {
    setLoading(true)
    axios.get(`${API}/students/${id}/history`).then((r) => { setData(r.data); setLoading(false) })
  }

  useEffect(() => { load() }, [id])

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
      <button className="back-btn" onClick={() => navigate('/')}>← Back to Dashboard</button>
      <div className="loading-spinner" />
    </div>
  )

  const { student, metrics, risk, attendance, scores, fees, latest_intervention } = data

  const riskColor = risk.risk_level === 'HIGH' ? 'var(--risk-high)' : risk.risk_level === 'MEDIUM' ? 'var(--risk-medium)' : 'var(--risk-low)'

  return (
    <div>
      <button className="back-btn" onClick={() => navigate('/')}>← Back to Dashboard</button>

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
              {risk.risk_level === 'HIGH' ? '🔴' : risk.risk_level === 'MEDIUM' ? '🟡' : '🟢'} {risk.risk_level} RISK
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
              <div style={{ fontSize: 22, fontWeight: 800, color: m.bad ? 'var(--risk-high)' : 'var(--risk-low)' }}>{m.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* AI Risk Explanation */}
      {latest_intervention && (
        <div className={`alert-box ${latest_intervention.risk_level.toLowerCase()}`} style={{ marginBottom: 24 }}>
          <div className="alert-title">🤖 Gemini AI Risk Analysis</div>
          <div className="alert-body">{latest_intervention.risk_explanation}</div>
          {latest_intervention.risk_level !== 'LOW' && !latest_intervention.actioned && (
            <button
              className="btn btn-ghost btn-sm"
              style={{ marginTop: 10 }}
              onClick={() => actionIntervention(latest_intervention.id)}
            >
              ✅ Mark as Actioned
            </button>
          )}
        </div>
      )}

      {/* Charts */}
      <div className="charts-grid" style={{ marginBottom: 24 }}>
        {attendance.length > 0 && <AttendanceChart data={attendance} />}
        {scores.length > 0 && <ScoreChart data={scores} />}
        {fees.length > 0 && <FeeChart data={fees} />}
      </div>

      {/* Intervention Actions */}
      {latest_intervention && latest_intervention.risk_level !== 'LOW' && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="section-title">
            📋 AI-Generated Intervention Plan
            {latest_intervention.actioned && (
              <span className="tag" style={{ marginLeft: 8, background: 'var(--risk-low-bg)', color: 'var(--risk-low)', border: '1px solid var(--risk-low-border)' }}>
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
      <div style={{ display: 'flex', gap: 12 }}>
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
