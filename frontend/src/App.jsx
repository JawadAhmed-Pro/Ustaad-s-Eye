import React, { useState, useCallback } from 'react'
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import StudentDetail from './pages/StudentDetail'
import LogEntry from './pages/LogEntry'
import Interventions from './pages/Interventions'

const ToastContext = React.createContext(null)

export function useToast() {
  return React.useContext(ToastContext)
}

function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()

  const navItems = [
    { icon: '📊', label: 'Dashboard', path: '/' },
    { icon: '⚠️', label: 'Interventions', path: '/interventions' },
    { icon: '✏️', label: 'Log Entry', path: '/log' },
  ]

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="logo-icon">👁️</div>
        <div className="logo-title">Ustaad's Eye</div>
        <div className="logo-subtitle">DROPOUT RISK MONITOR</div>
      </div>
      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <div
            key={item.path}
            className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
            onClick={() => navigate(item.path)}
          >
            <span className="nav-icon">{item.icon}</span>
            {item.label}
          </div>
        ))}
      </nav>
      <div style={{ padding: '16px', borderTop: '1px solid var(--border)' }}>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          🏫 Govt. Girls School<br />
          Muzaffargarh Road, Bahawalpur
        </div>
      </div>
    </aside>
  )
}

function ToastContainer({ toasts }) {
  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.type}`}>
          {t.message}
        </div>
      ))}
    </div>
  )
}

export default function App() {
  const [toasts, setToasts] = useState([])

  const addToast = useCallback((message, type = 'success') => {
    const id = Date.now()
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500)
  }, [])

  return (
    <ToastContext.Provider value={addToast}>
      <BrowserRouter>
        <div className="app-layout">
          <Sidebar />
          <main className="main-content">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/student/:id" element={<StudentDetail />} />
              <Route path="/interventions" element={<Interventions />} />
              <Route path="/log" element={<LogEntry />} />
            </Routes>
          </main>
          <ToastContainer toasts={toasts} />
        </div>
      </BrowserRouter>
    </ToastContext.Provider>
  )
}
