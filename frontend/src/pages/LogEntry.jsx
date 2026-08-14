import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { useToast } from '../App'
import { API } from '../api'

const toLocalISO = (dateStr) => {
  if (!dateStr) return new Date().toISOString()
  return dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00.000Z`
}

export default function LogEntry() {
  const [students, setStudents] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [tab, setTab] = useState('attendance')
  const [submitting, setSubmitting] = useState(false)
  const toast = useToast()

  // Attendance form
  const [attPresent, setAttPresent] = useState(true)
  const [attDate, setAttDate] = useState(new Date().toISOString().split('T')[0])
  const [attNotes, setAttNotes] = useState('')

  // Score form
  const [scoreSubject, setScoreSubject] = useState('Math')
  const [scoreValue, setScoreValue] = useState('')
  const [scoreMax, setScoreMax] = useState('100')
  const [scoreDate, setScoreDate] = useState(new Date().toISOString().split('T')[0])
  const [scoreType, setScoreType] = useState('Monthly Test')

  // Fee form
  const [feeMonth, setFeeMonth] = useState('August')
  const [feeYear, setFeeYear] = useState('2026')
  const [feeStatus, setFeeStatus] = useState('paid')

  // New student form
  const [newName, setNewName] = useState('')
  const [newGrade, setNewGrade] = useState('8')
  const [newRoll, setNewRoll] = useState('')
  const [newGuardian, setNewGuardian] = useState('')
  const [newPhone, setNewPhone] = useState('')

  useEffect(() => {
    axios.get(`${API}/students`).then((r) => setStudents(r.data))
  }, [])

  const submitAttendance = async () => {
    if (!selectedId) return toast('Please select a student first', 'error')
    setSubmitting(true)
    try {
      await axios.post(`${API}/students/${selectedId}/attendance`, {
        date: toLocalISO(attDate),
        present: attPresent,
        notes: attNotes || null,
      })
      toast(`✅ Attendance logged for ${students.find((s) => s.id == selectedId)?.name}`, 'success')
      setAttNotes('')
    } catch { toast('❌ Failed to log attendance', 'error') }
    setSubmitting(false)
  }

  const submitScore = async () => {
    if (!selectedId || !scoreValue) return toast('Please fill all fields', 'error')
    setSubmitting(true)
    try {
      await axios.post(`${API}/students/${selectedId}/scores`, {
        date: toLocalISO(scoreDate),
        subject: scoreSubject,
        score: parseFloat(scoreValue),
        max_score: parseFloat(scoreMax),
        test_type: scoreType,
      })
      toast(`✅ Score logged: ${scoreValue}/${scoreMax} in ${scoreSubject}`, 'success')
      setScoreValue('')
    } catch { toast('❌ Failed to log score', 'error') }
    setSubmitting(false)
  }

  const submitFee = async () => {
    if (!selectedId) return toast('Please select a student', 'error')
    setSubmitting(true)
    try {
      await axios.post(`${API}/students/${selectedId}/fees`, {
        month: feeMonth,
        year: parseInt(feeYear),
        status: feeStatus,
        amount: 500,
        paid_date: feeStatus === 'paid' ? new Date().toISOString() : null,
      })
      toast(`✅ Fee status updated: ${feeStatus} for ${feeMonth}`, 'success')
    } catch { toast('❌ Failed to update fee', 'error') }
    setSubmitting(false)
  }

  const addStudent = async () => {
    if (!newName || !newRoll) return toast('Name and roll number required', 'error')
    setSubmitting(true)
    try {
      const res = await axios.post(`${API}/students`, {
        name: newName,
        grade: newGrade,
        roll_number: newRoll,
        guardian_name: newGuardian || null,
        guardian_phone: newPhone || null,
      })
      setStudents((prev) => [...prev, res.data])
      toast(`✅ Student ${newName} added!`, 'success')
      setNewName(''); setNewRoll(''); setNewGuardian(''); setNewPhone('')
    } catch { toast('❌ Failed to add student', 'error') }
    setSubmitting(false)
  }

  const tabs = [
    { id: 'attendance', label: '📅 Attendance', icon: '📅' },
    { id: 'score', label: '📝 Test Score', icon: '📝' },
    { id: 'fee', label: '💰 Fee Status', icon: '💰' },
    { id: 'student', label: '➕ Add Student', icon: '➕' },
  ]

  const months = ['January','February','March','April','May','June','July','August','September','October','November','December']
  const subjects = ['Urdu', 'Math', 'Science', 'English', 'Islamiat', 'Social Studies', 'Computer']
  const testTypes = ['Quiz', 'Monthly Test', 'Mid-Term', 'Final Exam', 'Assignment']

  return (
    <div>
      <div className="page-header">
        <div className="page-title-row">
          <h1 className="page-title">✏️ Log Entry</h1>
          <span className="azadi-tag">AZADI EDITION</span>
        </div>
        <div className="page-subtitle">Record attendance, test scores, and fee status for students</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 20, alignItems: 'start' }}>
        {/* Tab sidebar */}
        <div className="card" style={{ padding: 12 }}>
          {tabs.map((t) => (
            <div
              key={t.id}
              className={`nav-item ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
              style={{ marginBottom: 6 }}
            >
              <span>{t.icon}</span> {t.label.split(' ').slice(1).join(' ')}
            </div>
          ))}
        </div>

        {/* Form area */}
        <div className="card">
          {tab !== 'student' && (
            <div className="form-group">
              <label className="form-label">Select Student</label>
              <select className="form-select" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
                <option value="">-- Choose a student --</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} (Grade {s.grade})</option>
                ))}
              </select>
            </div>
          )}

          {tab === 'attendance' && (
            <>
              <div className="section-title">📅 Log Attendance</div>
              <div className="form-group">
                <label className="form-label">Date</label>
                <input type="date" className="form-input" value={attDate} onChange={(e) => setAttDate(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Status</label>
                <div className="toggle-group">
                  <button
                    className={`toggle-btn ${attPresent ? 'active-present' : ''}`}
                    onClick={() => setAttPresent(true)}
                  >✅ Present</button>
                  <button
                    className={`toggle-btn ${!attPresent ? 'active-absent' : ''}`}
                    onClick={() => setAttPresent(false)}
                  >❌ Absent</button>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Notes (optional)</label>
                <input
                  type="text" className="form-input"
                  placeholder="e.g. Sick leave, family emergency..."
                  value={attNotes}
                  onChange={(e) => setAttNotes(e.target.value)}
                />
              </div>
              <button className="btn btn-primary" onClick={submitAttendance} disabled={submitting || !selectedId}>
                {submitting ? '⏳ Saving...' : '✅ Log Attendance'}
              </button>
            </>
          )}

          {tab === 'score' && (
            <>
              <div className="section-title">📝 Log Test Score</div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Subject</label>
                  <select className="form-select" value={scoreSubject} onChange={(e) => setScoreSubject(e.target.value)}>
                    {subjects.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Test Type</label>
                  <select className="form-select" value={scoreType} onChange={(e) => setScoreType(e.target.value)}>
                    {testTypes.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Score Obtained</label>
                  <input
                    type="number" className="form-input" placeholder="e.g. 72"
                    min="0" max={scoreMax}
                    value={scoreValue}
                    onChange={(e) => setScoreValue(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Out of (Max Score)</label>
                  <input
                    type="number" className="form-input" placeholder="e.g. 100"
                    value={scoreMax}
                    onChange={(e) => setScoreMax(e.target.value)}
                  />
                </div>
              </div>
              {scoreValue && scoreMax && (
                <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 14, color: 'var(--text-secondary)' }}>
                  Percentage: <strong style={{ color: parseFloat(scoreValue)/parseFloat(scoreMax)*100 < 40 ? 'var(--risk-high)' : 'var(--accent-light)' }}>
                    {(parseFloat(scoreValue)/parseFloat(scoreMax)*100).toFixed(1)}%
                  </strong>
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Date</label>
                <input type="date" className="form-input" value={scoreDate} onChange={(e) => setScoreDate(e.target.value)} />
              </div>
              <button className="btn btn-primary" onClick={submitScore} disabled={submitting || !selectedId || !scoreValue}>
                {submitting ? '⏳ Saving...' : '✅ Log Score'}
              </button>
            </>
          )}

          {tab === 'fee' && (
            <>
              <div className="section-title">💰 Update Fee Status</div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Month</label>
                  <select className="form-select" value={feeMonth} onChange={(e) => setFeeMonth(e.target.value)}>
                    {months.map((m) => <option key={m}>{m}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Year</label>
                  <select className="form-select" value={feeYear} onChange={(e) => setFeeYear(e.target.value)}>
                    {['2024', '2025', '2026', '2027'].map((y) => <option key={y}>{y}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Payment Status</label>
                <div className="toggle-group" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                  {['paid', 'pending', 'overdue'].map((s) => (
                    <button
                      key={s}
                      className={`toggle-btn ${feeStatus === s ? (s === 'paid' ? 'active-present' : s === 'overdue' ? 'active-absent' : '') : ''}`}
                      style={feeStatus === s && s === 'pending' ? { background: 'var(--risk-medium-bg)', color: 'var(--gold)', fontWeight: 800 } : {}}
                      onClick={() => setFeeStatus(s)}
                    >
                      {s === 'paid' ? '✅' : s === 'pending' ? '⏳' : '🔴'} {s}
                    </button>
                  ))}
                </div>
              </div>
              <button className="btn btn-primary" onClick={submitFee} disabled={submitting || !selectedId}>
                {submitting ? '⏳ Saving...' : '✅ Update Fee Status'}
              </button>
            </>
          )}

          {tab === 'student' && (
            <>
              <div className="section-title">➕ Add New Student</div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Full Name *</label>
                  <input type="text" className="form-input" placeholder="e.g. Amina Bibi" value={newName} onChange={(e) => setNewName(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Grade *</label>
                  <select className="form-select" value={newGrade} onChange={(e) => setNewGrade(e.target.value)}>
                    {['6','7','8','9','10'].map((g) => <option key={g}>{g}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Roll Number *</label>
                <input type="text" className="form-input" placeholder="e.g. GS-007" value={newRoll} onChange={(e) => setNewRoll(e.target.value)} />
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Guardian Name</label>
                  <input type="text" className="form-input" placeholder="e.g. Muhammad Ali" value={newGuardian} onChange={(e) => setNewGuardian(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Guardian Phone</label>
                  <input type="text" className="form-input" placeholder="e.g. 0312-1234567" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
                </div>
              </div>
              <button className="btn btn-primary" onClick={addStudent} disabled={submitting || !newName || !newRoll}>
                {submitting ? '⏳ Adding...' : '➕ Add Student'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

