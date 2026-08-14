from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


# ── Student ──────────────────────────────────────────────────────────────────
class StudentCreate(BaseModel):
    name: str
    grade: str
    roll_number: str
    guardian_name: Optional[str] = None
    guardian_phone: Optional[str] = None


class StudentOut(BaseModel):
    id: int
    name: str
    grade: str
    roll_number: str
    guardian_name: Optional[str]
    guardian_phone: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


# ── Attendance ────────────────────────────────────────────────────────────────
class AttendanceCreate(BaseModel):
    date: datetime
    present: bool
    notes: Optional[str] = None


class AttendanceOut(BaseModel):
    id: int
    student_id: int
    date: datetime
    present: bool
    notes: Optional[str]

    class Config:
        from_attributes = True


# ── Score ─────────────────────────────────────────────────────────────────────
class ScoreCreate(BaseModel):
    date: datetime
    subject: str
    score: float
    max_score: float = 100.0
    test_type: str = "Quiz"


class ScoreOut(BaseModel):
    id: int
    student_id: int
    date: datetime
    subject: str
    score: float
    max_score: float
    test_type: str

    class Config:
        from_attributes = True


# ── Fee ───────────────────────────────────────────────────────────────────────
class FeeCreate(BaseModel):
    month: str
    year: int
    status: str  # paid, pending, overdue
    amount: float = 500.0
    paid_date: Optional[datetime] = None


class FeeOut(BaseModel):
    id: int
    student_id: int
    month: str
    year: int
    status: str
    amount: float
    paid_date: Optional[datetime]

    class Config:
        from_attributes = True


# ── Intervention ──────────────────────────────────────────────────────────────
class InterventionOut(BaseModel):
    id: int
    student_id: int
    created_at: datetime
    risk_level: str
    risk_score: float
    risk_explanation: str
    parent_sms: str
    counselor_alert: str
    meeting_agenda: str
    actioned: bool
    actioned_at: Optional[datetime]
    dropout_stage: Optional[int] = 1
    urdu_voice_script: Optional[str] = None
    retention_status: Optional[str] = "AT_RISK"

    class Config:
        from_attributes = True


class RetentionUpdate(BaseModel):
    retention_status: str


# ── Dashboard ─────────────────────────────────────────────────────────────────
class StudentRiskSummary(BaseModel):
    student_id: int
    name: str
    grade: str
    risk_level: str
    risk_score: float
    attendance_rate: float
    avg_score: float
    fee_status: str
    last_analysis: Optional[datetime]
    consecutive_absences: Optional[int] = 0
    dropout_stage: Optional[int] = 0
    retention_status: Optional[str] = "AT_RISK"


class DropoutStagesBreakdown(BaseModel):
    stage1_count: int
    stage2_count: int
    stage3_count: int
    stage4_count: int


class ConsecutiveAbsenceAlert(BaseModel):
    student_id: int
    name: str
    grade: str
    consecutive_absences: int
    dropout_stage: int
    guardian_phone: Optional[str] = None


class DashboardOut(BaseModel):
    total_students: int
    high_risk: int
    medium_risk: int
    low_risk: int
    dropout_stages: DropoutStagesBreakdown
    consecutive_absence_alerts: List[ConsecutiveAbsenceAlert]
    saved_students_count: int
    students: List[StudentRiskSummary]



# ── History (for charts) ──────────────────────────────────────────────────────
class StudentHistory(BaseModel):
    student: StudentOut
    attendance: List[AttendanceOut]
    scores: List[ScoreOut]
    fees: List[FeeOut]
    latest_intervention: Optional[InterventionOut]


# ── AI Requests ───────────────────────────────────────────────────────────────
class ChatRequest(BaseModel):
    prompt: str
    context_students: Optional[List[dict]] = None


class SimulationRequest(BaseModel):
    attendance_rate: float
    avg_score: float
    fee_overdue_months: int

