// Auto-detect API base URL:
// - In production (Render): same origin, no prefix needed since FastAPI serves everything
// - In local dev: Vite proxy handles /api -> localhost:8000
const API_BASE = import.meta.env.PROD ? '' : ''

export const API = API_BASE + '/api'
