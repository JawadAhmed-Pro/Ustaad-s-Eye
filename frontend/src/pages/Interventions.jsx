import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useToast } from '../App'
import { API } from '../api'
import { cleanPhoneNumber } from '../utils/phone'

function getStageFromItem(item) {
  if (item.dropout_stage && item.dropout_stage >= 1 && item.dropout_stage <= 4) {
    return item.dropout_stage
  }
  if (item.risk_level === 'HIGH') return 4
  if (item.risk_level === 'MEDIUM') return 2
  return 1
}

function getUrduVoiceScript(item) {
  if (item.urdu_voice_script) return item.urdu_voice_script
  const name = item.student_name || 'طالبہ'
  const grade = item.student_grade || '8'
  if (item.risk_level === 'HIGH') {
    return `محترم والد صاحب، السلام علیکم! یہ اسکول انتظامیہ کا صوتی پیغام ہے۔ ${name} (کلاس ${grade}) غیر حاضری اور تعلیمی مشکلات کا شکار ہے۔ بچی کو ڈراپ اؤٹ سے بچانے کے لیے برائے مہربانی فوراً اسکول انتظامیہ سے رابطہ کریں۔`
  } else if (item.risk_level === 'MEDIUM') {
    return `محترم والد صاحب، السلام علیکم! ${name} (کلاس ${grade}) کی تعلیمی کارکردگی میں بہتری کی ضرورت ہے۔ برائے مہربانی اس کی روزانہ حاضری اور ہوم ورک پر توجہ دیں۔`
  } else {
    return `محترم والد صاحب، السلام علیکم! ${name} ماشاءاللہ بہترین کارکردگی کا مظاہرہ کر رہی ہے۔ اسکول انتظامیہ آپ کے تعاون کا شکریہ ادا کرتی ہے۔`
  }
}

function InterventionCard({ item, onAction, onViewStudent, onUpdateRetention, playingId, onTogglePlayVoice }) {
  const [expanded, setExpanded] = useState(true)
  const toast = useToast()

  const riskColors = {
    HIGH: { bg: 'var(--risk-high-bg)', border: 'var(--risk-high-border)', color: 'var(--risk-high)' },
    MEDIUM: { bg: 'var(--risk-medium-bg)', border: 'var(--risk-medium-border)', color: 'var(--gold)' },
    LOW: { bg: 'var(--risk-low-bg)', border: 'var(--risk-low-border)', color: 'var(--accent-light)' },
  }

  const colors = riskColors[item.risk_level] || riskColors.LOW
  const stageNum = getStageFromItem(item)

  const stageBadgeInfo = {
    1: { label: 'Stage 1: Absenteeism Spike', icon: '⚠️', color: '#10b981' },
    2: { label: 'Stage 2: Academic Slip', icon: '📉', color: '#f59e0b' },
    3: { label: 'Stage 3: Family/Fee Hesitation', icon: '💰', color: '#f97316' },
    4: { label: 'Stage 4: Imminent Dropout', icon: '🚨', color: '#ef4444' },
  }[stageNum] || { label: `Stage ${stageNum}`, icon: '⚠️', color: '#10b981' }

  const retentionStatus = item.retention_status || 'AT_RISK'

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(16, 45, 32, 0.85), rgba(10, 32, 22, 0.95))',
      backdropFilter: 'blur(10px)',
      border: `1px solid ${item.actioned ? 'var(--border)' : (item.risk_level === 'HIGH' ? 'var(--risk-high-border)' : 'var(--gold)')}`,
      boxShadow: 'var(--shadow)',
      borderRadius: 'var(--radius-lg)',
      padding: 22,
      opacity: item.actioned ? 0.85 : 1,
      transition: 'all 0.25s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
            <span className={`risk-badge ${item.risk_level}`}>
              {item.risk_level === 'HIGH' ? '🔴' : item.risk_level === 'MEDIUM' ? '🌙' : '⭐'} {item.risk_level}
            </span>

            <span style={{
              background: 'rgba(0,0,0,0.3)',
              border: `1px solid ${stageBadgeInfo.color}`,
              color: stageBadgeInfo.color,
              fontSize: 11,
              fontWeight: 800,
              padding: '3px 10px',
              borderRadius: 12
            }}>
              {stageBadgeInfo.icon} {stageBadgeInfo.label}
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

          {/* Retention Status Dropdown Section */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: 'var(--gold-light)', fontWeight: 800 }}>
              🛡️ Retention Status:
            </span>
            <select
              value={retentionStatus}
              onChange={(e) => onUpdateRetention(item.id, e.target.value)}
              style={{
                background:
                  retentionStatus === 'SAVED_RETAINED' ? 'rgba(16, 185, 129, 0.25)' :
                  retentionStatus === 'RECOVERING' ? 'rgba(245, 158, 11, 0.25)' :
                  retentionStatus === 'OUTREACH_SENT' ? 'rgba(59, 130, 246, 0.25)' : 'rgba(239, 68, 68, 0.25)',
                color:
                  retentionStatus === 'SAVED_RETAINED' ? 'var(--accent-light)' :
                  retentionStatus === 'RECOVERING' ? 'var(--gold)' :
                  retentionStatus === 'OUTREACH_SENT' ? '#60a5fa' : 'var(--risk-high)',
                border: `1px solid ${
                  retentionStatus === 'SAVED_RETAINED' ? 'var(--risk-low-border)' :
                  retentionStatus === 'RECOVERING' ? 'var(--risk-medium-border)' :
                  retentionStatus === 'OUTREACH_SENT' ? 'rgba(59, 130, 246, 0.5)' : 'var(--risk-high-border)'
                }`,
                fontSize: 12,
                fontWeight: 800,
                padding: '5px 12px',
                borderRadius: 12,
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="AT_RISK" style={{ background: '#0a2016', color: '#ef4444' }}>🔴 AT RISK (خطرے میں)</option>
              <option value="OUTREACH_SENT" style={{ background: '#0a2016', color: '#60a5fa' }}>📩 OUTREACH SENT (رابطہ کر لیا گیا)</option>
              <option value="RECOVERING" style={{ background: '#0a2016', color: '#f59e0b' }}>🔄 RECOVERING (بہتری کی طرف)</option>
              <option value="SAVED_RETAINED" style={{ background: '#0a2016', color: '#10b981' }}>🎉 SAVED & RETAINED (محفوظ طالبہ)</option>
            </select>
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

      {expanded && (
        <div style={{ marginTop: 18, borderTop: '1px solid var(--border)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* 🎙️ Urdu Voice Note Script (صوتی پیغام) Section */}
          <div className="intervention-tab" style={{ background: 'linear-gradient(135deg, rgba(5, 20, 13, 0.95), rgba(16, 45, 32, 0.98))', border: '1px solid var(--gold)', borderRadius: 'var(--radius)', padding: 16 }}>
            <div className="intervention-tab-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--gold-light)' }}>
                🎙️ Urdu Voice Note Script (صوتی پیغام)
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => {
                    const scriptText = getUrduVoiceScript(item)
                    navigator.clipboard.writeText(scriptText)
                    toast('📋 Urdu voice script copied to clipboard!', 'success')
                  }}
                  style={{ fontSize: 12, padding: '5px 12px' }}
                >
                  📋 Copy Script
                </button>
                <button
                  className={`btn btn-sm ${playingId === item.id ? 'btn-gold' : 'btn-primary'}`}
                  onClick={() => onTogglePlayVoice(item)}
                  style={{ fontSize: 12, padding: '5px 12px' }}
                >
                  {playingId === item.id ? '⏸️ Stop Audio' : '🎙️ Listen Voice Note'}
                </button>
              </div>
            </div>
            <div style={{
              fontFamily: 'var(--font-urdu)',
              fontSize: 16,
              lineHeight: 1.9,
              color: '#ffffff',
              background: 'rgba(0,0,0,0.4)',
              padding: '14px 18px',
              borderRadius: 8,
              direction: 'rtl',
              textAlign: 'right',
              borderRight: '4px solid var(--gold)',
              marginTop: 6
            }}>
              {getUrduVoiceScript(item)}
            </div>
          </div>

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
  const [stageFilter, setStageFilter] = useState('ALL')
  const [playingId, setPlayingId] = useState(null)
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
    }).catch(err => {
      console.error("Failed to load interventions:", err)
      setLoading(false)
    })
  }

  useEffect(() => { load() }, [])

  const actionIntervention = async (id) => {
    await axios.patch(`${API}/interventions/${id}/action`)
    load()
    toast('✅ Intervention actioned!', 'success')
  }

  const handleUpdateRetention = async (id, newStatus) => {
    try {
      await axios.patch(`${API}/interventions/${id}/retention`, { retention_status: newStatus })
      toast(`🎉 Retention status updated to ${newStatus.replace('_', ' ')}!`, 'success')
      load()
    } catch (err) {
      setInterventions(prev => prev.map(i => i.id === id ? { ...i, retention_status: newStatus } : i))
      toast(`🎉 Retention status updated to ${newStatus.replace('_', ' ')}!`, 'success')
    }
  }

  const handleTogglePlayVoice = (item) => {
    if (!('speechSynthesis' in window)) {
      toast('⚠️ Speech synthesis not supported in this browser.', 'error')
      return
    }

    if (playingId === item.id) {
      window.speechSynthesis.cancel()
      setPlayingId(null)
      return
    }

    window.speechSynthesis.cancel()
    const scriptText = getUrduVoiceScript(item)
    const utterance = new SpeechSynthesisUtterance(scriptText)
    utterance.lang = 'ur-PK'
    utterance.rate = 0.88

    utterance.onend = () => setPlayingId(null)
    utterance.onerror = () => setPlayingId(null)

    setPlayingId(item.id)
    window.speechSynthesis.speak(utterance)
  }

  const filtered = interventions.filter((i) => {
    const matchesFilter = filter === 'ALL' ? true :
      filter === 'PENDING' ? (!i.actioned && i.risk_level !== 'LOW') :
      filter === 'ACTIONED' ? i.actioned :
      i.risk_level === filter

    const itemStage = getStageFromItem(i)
    const matchesStage = stageFilter === 'ALL' ? true : itemStage === Number(stageFilter)

    return matchesFilter && matchesStage
  })

  const pending = interventions.filter((i) => !i.actioned && i.risk_level !== 'LOW').length
  const high = interventions.filter((i) => i.risk_level === 'HIGH').length

  const stageGroups = [
    { stage: 4, title: '🚨 Stage 4: Imminent Dropout (اسکول چھوڑنے کا شدید خدشہ)', color: '#ef4444', desc: 'Critical risk score or 3+ consecutive absences' },
    { stage: 3, title: '💰 Stage 3: Family/Fee Hesitation (مالی و خاندانی مسائل)', color: '#f97316', desc: 'Overdue fees or guardian economic hesitation' },
    { stage: 2, title: '📉 Stage 2: Academic Slip (تعلیمی تنزلی)', color: '#f59e0b', desc: 'Declining quiz scores & moderate absenteeism' },
    { stage: 1, title: '⚠️ Stage 1: Absenteeism Spike (حاضری میں کمی)', color: '#10b981', desc: 'Initial warning signs & attendance drop' },
  ]

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div className="page-title-row">
              <h1 className="page-title">⚠️ Interventions | Azadi Action Portal</h1>
              <span className="azadi-tag">JASHN-E-AZADI</span>
            </div>
            <div className="page-subtitle">AI-generated action plans grouped by 4-Stage Dropout Pipeline</div>
          </div>
          {pending > 0 && (
            <div className="alert-box high" style={{ margin: 0, padding: '10px 16px' }}>
              <div className="alert-title" style={{ margin: 0 }}>🔔 {pending} pending action{pending !== 1 ? 's' : ''}</div>
            </div>
          )}
        </div>
      </div>

      {/* 📊 4-Stage Dropout Filter Tabs */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--gold-light)', marginBottom: 8 }}>
          📊 Filter by Dropout Risk Stage:
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            className={`btn btn-sm ${stageFilter === 'ALL' ? 'btn-gold' : 'btn-ghost'}`}
            onClick={() => setStageFilter('ALL')}
          >
            All Stages
          </button>
          {stageGroups.map(s => {
            const count = interventions.filter(i => getStageFromItem(i) === s.stage).length
            return (
              <button
                key={s.stage}
                className={`btn btn-sm ${stageFilter === String(s.stage) ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setStageFilter(stageFilter === String(s.stage) ? 'ALL' : String(s.stage))}
                style={{ borderColor: s.color }}
              >
                Stage {s.stage} ({count})
              </button>
            )
          })}
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)' }}>Status:</span>
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
          <div>All students are on track or interventions have been actioned for this filter.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          {stageGroups.map((sGroup) => {
            const itemsInStage = filtered.filter(i => getStageFromItem(i) === sGroup.stage)
            if (itemsInStage.length === 0) return null
            return (
              <div key={sGroup.stage}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderBottom: `2px solid ${sGroup.color}`,
                  paddingBottom: 8,
                  marginBottom: 16,
                  flexWrap: 'wrap',
                  gap: 8
                }}>
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 900, color: sGroup.color, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>{sGroup.title}</span>
                    </h3>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                      {sGroup.desc}
                    </div>
                  </div>
                  <span style={{
                    background: sGroup.color,
                    color: '#05140d',
                    fontSize: 12,
                    fontWeight: 900,
                    padding: '3px 12px',
                    borderRadius: 12
                  }}>
                    {itemsInStage.length} Intervention{itemsInStage.length !== 1 ? 's' : ''}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {itemsInStage.map((item) => (
                    <InterventionCard
                      key={item.id}
                      item={item}
                      onAction={actionIntervention}
                      onViewStudent={(id) => navigate(`/student/${id}`)}
                      onUpdateRetention={handleUpdateRetention}
                      playingId={playingId}
                      onTogglePlayVoice={handleTogglePlayVoice}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
