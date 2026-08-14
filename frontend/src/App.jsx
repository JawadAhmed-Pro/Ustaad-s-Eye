import React, { useState, useCallback, useEffect } from 'react'
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import StudentDetail from './pages/StudentDetail'
import LogEntry from './pages/LogEntry'
import Interventions from './pages/Interventions'

const ToastContext = React.createContext(null)

export function useToast() {
  return React.useContext(ToastContext)
}

function Sidebar({ isOpen, onClose }) {
  const navigate = useNavigate()
  const location = useLocation()

  const navItems = [
    { icon: '📊', label: 'Dashboard', path: '/' },
    { icon: '⚠️', label: 'Interventions', path: '/interventions' },
    { icon: '✏️', label: 'Log Entry', path: '/log' },
  ]

  const handleNav = (path) => {
    navigate(path)
    if (onClose) onClose()
  }

  return (
    <>
      <div className={`sidebar-overlay ${isOpen ? 'open' : ''}`} onClick={onClose} />
      <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <div className="logo-icon-wrap">
            <div className="logo-icon">👁️</div>
            <div>
              <div className="logo-title">Ustaad's Eye</div>
              <div className="logo-subtitle">DROPOUT RISK MONITOR</div>
            </div>
          </div>
          <div className="logo-urdu">استاد کی نظر — تعلیمی خود مختاری اور ترقی</div>
        </div>
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <div
              key={item.path}
              className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
              onClick={() => handleNav(item.path)}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </div>
          ))}
        </nav>
        <div style={{ padding: '16px', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            🇵🇰 Govt. Girls School<br />
            Muzaffargarh Road, Bahawalpur
          </div>
        </div>
      </aside>
    </>
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
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [showInstallBanner, setShowInstallBanner] = useState(false)

  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setShowInstallBanner(true)
    }
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
  }, [])

  const handleInstallClick = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setShowInstallBanner(false)
    }
    setDeferredPrompt(null)
  }

  const addToast = useCallback((message, type = 'success') => {
    const id = Date.now()
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500)
  }, [])

  return (
    <ToastContext.Provider value={addToast}>
      <BrowserRouter>
        {/* Top celebratory Azadi Banner */}
        <div className="azadi-banner">
          <span>🇵🇰 Jashn-e-Azadi Mubarak! 14th August Independence Day Special Edition 🇵🇰</span>
          <span className="azadi-tag">AZADI EDITION</span>
          <span className="azadi-urdu">جشنِ آزادی مبارک</span>
        </div>

        {/* Mobile top header */}
        <div className="mobile-header">
          <button className="menu-toggle-btn" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Toggle menu">
            ☰
          </button>
          <div style={{ fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>👁️</span> Ustaad's Eye
          </div>
          <span className="azadi-tag" style={{ fontSize: '10px' }}>🇵🇰 14 Aug</span>
        </div>

        <div className="app-layout">
          <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
          <main className="main-content">
            {showInstallBanner && (
              <div className="pwa-install-banner">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '24px' }}>📱</span>
                  <div>
                    <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>Ustaad's Eye Mobile App</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Install app for offline access & instant dropout notifications</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn btn-gold btn-sm" onClick={handleInstallClick}>
                    📱 Install Ustaad's Eye PWA App
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowInstallBanner(false)}>✕</button>
                </div>
              </div>
            )}
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

