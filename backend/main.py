import os
from fastapi import FastAPI, Depends, HTTPException, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import List, Optional
import asyncio

from database import (
    get_db, create_tables,
    Student, AttendanceRecord, ScoreRecord, FeeRecord, Intervention
)
from models import (
    StudentCreate, StudentOut,
    AttendanceCreate, AttendanceOut,
    ScoreCreate, ScoreOut,
    FeeCreate, FeeOut,
    InterventionOut,
    StudentRiskSummary, DashboardOut,
    StudentHistory,
    ChatRequest, SimulationRequest
)
from ai import analyze_student_risk, draft_intervention, chat_with_ustaad_ai, simulate_risk_ai


app = FastAPI(title="Ustaad's Eye API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api = APIRouter()

# ── Serve React frontend static build (for Render one-service deployment) ──
FRONTEND_BUILD = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")



@app.on_event("startup")
async def startup():
    create_tables()
    await seed_demo_data()


# ─────────────────────────────────────────────────────────────────────────────
# Helper: compute student risk metrics from DB
# ─────────────────────────────────────────────────────────────────────────────
def compute_student_metrics(student: Student) -> dict:
    records = student.attendance_records
    total = len(records)
    present = sum(1 for r in records if r.present)
    attendance_rate = (present / total * 100) if total > 0 else 100.0

    scores = student.score_records
    if scores:
        percentages = [(s.score / s.max_score * 100) for s in scores]
        avg_score = sum(percentages) / len(percentages)
        recent_scores = [round(p, 1) for p in percentages[-5:]]
    else:
        avg_score = 100.0
        recent_scores = []

    fees = student.fee_records
    fee_overdue = sum(1 for f in fees if f.status in ("pending", "overdue"))
    fee_history = [f.status for f in sorted(fees, key=lambda x: (x.year, x.month))[-3:]]
    latest_fee = fees[-1].status if fees else "paid"

    recent_att = [r.present for r in sorted(records, key=lambda x: x.date)[-10:]]

    return {
        "name": student.name,
        "grade": student.grade,
        "attendance_rate": round(attendance_rate, 1),
        "avg_score": round(avg_score, 1),
        "fee_overdue_months": fee_overdue,
        "recent_attendance": recent_att,
        "recent_scores": recent_scores,
        "fee_history": fee_history,
        "latest_fee_status": latest_fee,
    }


def get_latest_risk(student: Student) -> dict:
    if student.interventions:
        latest = max(student.interventions, key=lambda i: i.created_at)
        return {
            "risk_level": latest.risk_level,
            "risk_score": latest.risk_score,
            "last_analysis": latest.created_at,
        }
    return {"risk_level": "UNKNOWN", "risk_score": 0, "last_analysis": None}


# ─────────────────────────────────────────────────────────────────────────────
# Students
# ─────────────────────────────────────────────────────────────────────────────
@api.get("/students", response_model=List[StudentOut])
def list_students(db: Session = Depends(get_db)):
    return db.query(Student).all()


@api.post("/students", response_model=StudentOut)
def create_student(data: StudentCreate, db: Session = Depends(get_db)):
    student = Student(**data.model_dump())
    db.add(student)
    db.commit()
    db.refresh(student)
    return student


@api.get("/students/{student_id}", response_model=StudentOut)
def get_student(student_id: int, db: Session = Depends(get_db)):
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    return student


@api.delete("/students/{student_id}")
def delete_student(student_id: int, db: Session = Depends(get_db)):
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    db.delete(student)
    db.commit()
    return {"message": "Student deleted"}


# ─────────────────────────────────────────────────────────────────────────────
# Attendance
# ─────────────────────────────────────────────────────────────────────────────
@api.post("/students/{student_id}/attendance", response_model=AttendanceOut)
def log_attendance(student_id: int, data: AttendanceCreate, db: Session = Depends(get_db)):
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    record = AttendanceRecord(student_id=student_id, **data.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@api.get("/students/{student_id}/attendance", response_model=List[AttendanceOut])
def get_attendance(student_id: int, db: Session = Depends(get_db)):
    return db.query(AttendanceRecord).filter(
        AttendanceRecord.student_id == student_id
    ).order_by(AttendanceRecord.date).all()


# ─────────────────────────────────────────────────────────────────────────────
# Scores
# ─────────────────────────────────────────────────────────────────────────────
@api.post("/students/{student_id}/scores", response_model=ScoreOut)
def log_score(student_id: int, data: ScoreCreate, db: Session = Depends(get_db)):
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    record = ScoreRecord(student_id=student_id, **data.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@api.get("/students/{student_id}/scores", response_model=List[ScoreOut])
def get_scores(student_id: int, db: Session = Depends(get_db)):
    return db.query(ScoreRecord).filter(
        ScoreRecord.student_id == student_id
    ).order_by(ScoreRecord.date).all()


# ─────────────────────────────────────────────────────────────────────────────
# Fees
# ─────────────────────────────────────────────────────────────────────────────
@api.post("/students/{student_id}/fees", response_model=FeeOut)
def log_fee(student_id: int, data: FeeCreate, db: Session = Depends(get_db)):
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    record = FeeRecord(student_id=student_id, **data.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@api.get("/students/{student_id}/fees", response_model=List[FeeOut])
def get_fees(student_id: int, db: Session = Depends(get_db)):
    return db.query(FeeRecord).filter(
        FeeRecord.student_id == student_id
    ).order_by(FeeRecord.year, FeeRecord.month).all()


# ─────────────────────────────────────────────────────────────────────────────
# AI Analysis & Interventions
# ─────────────────────────────────────────────────────────────────────────────
@api.post("/ai/chat")
async def ai_chat_endpoint(req: ChatRequest, db: Session = Depends(get_db)):
    result = await chat_with_ustaad(req.prompt)
    return result


@api.post("/ai/simulate")
async def simulate_risk_endpoint(req: SimulationRequest):
    return await simulate_risk_ai(
        attendance_rate=req.attendance_rate,
        avg_score=req.avg_score,
        fee_overdue_months=req.fee_overdue_months,
    )



@api.get("/students/{student_id}/analysis")
async def analyze_student(student_id: int, db: Session = Depends(get_db)):
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    metrics = compute_student_metrics(student)
    risk_data = await analyze_student_risk(metrics)
    return {**metrics, **risk_data}


@api.post("/students/{student_id}/intervention", response_model=InterventionOut)
async def generate_intervention(student_id: int, db: Session = Depends(get_db)):
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    metrics = compute_student_metrics(student)
    risk_data = await analyze_student_risk(metrics)

    intervention_drafts = await draft_intervention(
        student_name=student.name,
        grade=student.grade,
        guardian_name=student.guardian_name or "Guardian",
        guardian_phone=student.guardian_phone or "N/A",
        risk_data=risk_data,
    )

    intervention = Intervention(
        student_id=student_id,
        risk_level=risk_data["risk_level"],
        risk_score=risk_data["risk_score"],
        risk_explanation=risk_data["risk_explanation"],
        parent_sms=intervention_drafts["parent_sms"],
        counselor_alert=intervention_drafts["counselor_alert"],
        meeting_agenda=intervention_drafts["meeting_agenda"],
    )
    db.add(intervention)
    db.commit()
    db.refresh(intervention)
    return intervention


@api.patch("/interventions/{intervention_id}/action", response_model=InterventionOut)
def action_intervention(intervention_id: int, db: Session = Depends(get_db)):
    intervention = db.query(Intervention).filter(Intervention.id == intervention_id).first()
    if not intervention:
        raise HTTPException(status_code=404, detail="Intervention not found")
    intervention.actioned = True
    intervention.actioned_at = datetime.utcnow()
    db.commit()
    db.refresh(intervention)
    return intervention


@api.get("/interventions", response_model=List[InterventionOut])
def list_interventions(db: Session = Depends(get_db)):
    return db.query(Intervention).order_by(Intervention.created_at.desc()).all()


@api.post("/ai/chat")
async def chat_ai(req: ChatRequest, db: Session = Depends(get_db)):
    context = req.context_students
    if context is None:
        try:
            students = db.query(Student).all()
            context = []
            for s in students[:8]:
                m = compute_student_metrics(s)
                r = get_latest_risk(s)
                context.append({
                    "name": s.name,
                    "grade": s.grade,
                    "risk_level": r.get("risk_level", "UNKNOWN"),
                    "risk_score": r.get("risk_score", 0),
                    "attendance_rate": m.get("attendance_rate", 0),
                    "avg_score": m.get("avg_score", 0),
                    "fee_status": m.get("latest_fee_status", "paid")
                })
        except Exception:
            context = []

    res = await chat_with_ustaad_ai(prompt=req.prompt, context_students=context)
    return res


@api.post("/ai/simulate")
async def simulate_ai(req: SimulationRequest):
    res = await simulate_risk_ai(
        attendance_rate=req.attendance_rate,
        avg_score=req.avg_score,
        fee_overdue_months=req.fee_overdue_months
    )
    return res


# ─────────────────────────────────────────────────────────────────────────────
# Student History (for charts)
# ─────────────────────────────────────────────────────────────────────────────
@api.get("/students/{student_id}/history")
def get_student_history(student_id: int, db: Session = Depends(get_db)):
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    metrics = compute_student_metrics(student)
    latest_risk = get_latest_risk(student)

    latest_intervention = None
    if student.interventions:
        li = max(student.interventions, key=lambda i: i.created_at)
        latest_intervention = {
            "id": li.id,
            "risk_level": li.risk_level,
            "risk_score": li.risk_score,
            "risk_explanation": li.risk_explanation,
            "parent_sms": li.parent_sms,
            "counselor_alert": li.counselor_alert,
            "meeting_agenda": li.meeting_agenda,
            "actioned": li.actioned,
            "actioned_at": li.actioned_at.isoformat() if li.actioned_at else None,
            "created_at": li.created_at.isoformat(),
        }

    attendance = [
        {"date": r.date.isoformat(), "present": r.present}
        for r in sorted(student.attendance_records, key=lambda x: x.date)
    ]
    scores = [
        {
            "date": r.date.isoformat(),
            "subject": r.subject,
            "score": r.score,
            "max_score": r.max_score,
            "percentage": round(r.score / r.max_score * 100, 1),
            "test_type": r.test_type,
        }
        for r in sorted(student.score_records, key=lambda x: x.date)
    ]
    fees = [
        {"month": f.month, "year": f.year, "status": f.status, "amount": f.amount}
        for f in student.fee_records
    ]

    return {
        "student": {
            "id": student.id,
            "name": student.name,
            "grade": student.grade,
            "roll_number": student.roll_number,
            "guardian_name": student.guardian_name,
            "guardian_phone": student.guardian_phone,
        },
        "metrics": metrics,
        "risk": latest_risk,
        "attendance": attendance,
        "scores": scores,
        "fees": fees,
        "latest_intervention": latest_intervention,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Dashboard
# ─────────────────────────────────────────────────────────────────────────────
@api.get("/dashboard")
def get_dashboard(db: Session = Depends(get_db)):
    students = db.query(Student).all()
    summaries = []

    for student in students:
        metrics = compute_student_metrics(student)
        latest_risk = get_latest_risk(student)
        summaries.append({
            "student_id": student.id,
            "name": student.name,
            "grade": student.grade,
            "guardian_phone": student.guardian_phone,
            "risk_level": latest_risk["risk_level"],
            "risk_score": latest_risk["risk_score"],
            "attendance_rate": metrics["attendance_rate"],
            "avg_score": metrics["avg_score"],
            "fee_status": metrics["latest_fee_status"],
            "last_analysis": latest_risk["last_analysis"].isoformat() if latest_risk["last_analysis"] else None,
        })

    summaries.sort(key=lambda x: x["risk_score"], reverse=True)

    high = sum(1 for s in summaries if s["risk_level"] == "HIGH")
    medium = sum(1 for s in summaries if s["risk_level"] == "MEDIUM")
    low = sum(1 for s in summaries if s["risk_level"] in ("LOW", "UNKNOWN"))

    return {
        "total_students": len(students),
        "high_risk": high,
        "medium_risk": medium,
        "low_risk": low,
        "students": summaries,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Demo Data Seed
# ─────────────────────────────────────────────────────────────────────────────
async def seed_demo_data():
    """Pre-seed demo students with realistic historical data."""
    from database import SessionLocal
    db = SessionLocal()

    try:
        if db.query(Student).count() > 0:
            return  # Already seeded

        today = datetime.utcnow()

        demo_students = [
            {
                "name": "Amina Bibi",
                "grade": "8",
                "roll_number": "GS-001",
                "guardian_name": "Muhammad Rafiq",
                "guardian_phone": "0312-1234567",
                "attendance_pattern": [True, False, False, True, False, False, False, True, False, False,
                                        True, False, True, False, False, True, False, False, True, False],
                "scores": [(38, "Urdu"), (32, "Math"), (41, "Science"), (28, "English"), (35, "Islamiat")],
                "fees": ["paid", "pending", "overdue", "overdue"],
            },
            {
                "name": "Sara Naz",
                "grade": "8",
                "roll_number": "GS-002",
                "guardian_name": "Allah Ditta",
                "guardian_phone": "0333-9876543",
                "attendance_pattern": [True, True, False, True, True, True, False, True, True, True,
                                        True, True, False, True, True, True, True, False, True, True],
                "scores": [(65, "Urdu"), (58, "Math"), (62, "Science"), (55, "English"), (70, "Islamiat")],
                "fees": ["paid", "paid", "pending", "pending"],
            },
            {
                "name": "Fatima Zahra",
                "grade": "8",
                "roll_number": "GS-003",
                "guardian_name": "Khalid Mahmood",
                "guardian_phone": "0345-1112233",
                "attendance_pattern": [True, True, True, True, True, True, True, False, True, True,
                                        True, True, True, True, True, True, True, True, False, True],
                "scores": [(88, "Urdu"), (92, "Math"), (85, "Science"), (90, "English"), (87, "Islamiat")],
                "fees": ["paid", "paid", "paid", "paid"],
            },
            {
                "name": "Zainab Khatoon",
                "grade": "7",
                "roll_number": "GS-004",
                "guardian_name": "Ghulam Rasool",
                "guardian_phone": "0321-5556677",
                "attendance_pattern": [True, True, False, True, False, True, True, False, False, True,
                                        True, False, True, True, False, True, False, True, False, False],
                "scores": [(52, "Urdu"), (45, "Math"), (48, "Science"), (50, "English"), (43, "Islamiat")],
                "fees": ["paid", "paid", "pending", "overdue"],
            },
            {
                "name": "Hina Akhtar",
                "grade": "7",
                "roll_number": "GS-005",
                "guardian_name": "Bashir Ahmad",
                "guardian_phone": "0300-7778899",
                "attendance_pattern": [False, False, True, False, False, False, True, False, False, False,
                                        False, True, False, False, False, True, False, False, False, False],
                "scores": [(22, "Urdu"), (18, "Math"), (25, "Science"), (20, "English"), (15, "Islamiat")],
                "fees": ["pending", "overdue", "overdue", "overdue"],
            },
            {
                "name": "Nadia Parveen",
                "grade": "6",
                "roll_number": "GS-006",
                "guardian_name": "Imran Khan",
                "guardian_phone": "0315-4445566",
                "attendance_pattern": [True, True, True, False, True, True, True, True, False, True,
                                        True, True, True, True, True, False, True, True, True, True],
                "scores": [(75, "Urdu"), (68, "Math"), (72, "Science"), (80, "English"), (78, "Islamiat")],
                "fees": ["paid", "paid", "paid", "pending"],
            },
        ]

        subjects = ["Urdu", "Math", "Science", "English", "Islamiat"]
        months = ["March", "April", "May", "June"]

        for idx, demo in enumerate(demo_students):
            student = Student(
                name=demo["name"],
                grade=demo["grade"],
                roll_number=demo["roll_number"],
                guardian_name=demo["guardian_name"],
                guardian_phone=demo["guardian_phone"],
            )
            db.add(student)
            db.flush()

            # Attendance records over 20 days
            for day_offset, present in enumerate(demo["attendance_pattern"]):
                date = today - timedelta(days=20 - day_offset)
                record = AttendanceRecord(
                    student_id=student.id,
                    date=date,
                    present=present,
                )
                db.add(record)

            # Score records
            for score_idx, (score_val, subject) in enumerate(demo["scores"]):
                date = today - timedelta(days=18 - score_idx * 3)
                record = ScoreRecord(
                    student_id=student.id,
                    date=date,
                    subject=subject,
                    score=score_val,
                    max_score=100.0,
                    test_type="Monthly Test",
                )
                db.add(record)

            # Fee records
            for month_idx, fee_status in enumerate(demo["fees"]):
                record = FeeRecord(
                    student_id=student.id,
                    month=months[month_idx],
                    year=2025,
                    status=fee_status,
                    amount=500.0,
                    paid_date=today - timedelta(days=30 * (3 - month_idx)) if fee_status == "paid" else None,
                )
                db.add(record)

        db.commit()
        print("✅ Demo data seeded successfully")

        # Pre-generate interventions for high/medium risk students
        db_students = db.query(Student).all()
        for student in db_students:
            metrics = compute_student_metrics(student)
            from ai import compute_local_risk
            local = compute_local_risk(
                metrics["attendance_rate"],
                metrics["avg_score"],
                metrics["fee_overdue_months"]
            )
            if local["risk_level"] in ("HIGH", "MEDIUM"):
                risk_data = await analyze_student_risk(metrics)
                drafts = await draft_intervention(
                    student_name=student.name,
                    grade=student.grade,
                    guardian_name=student.guardian_name or "Guardian",
                    guardian_phone=student.guardian_phone or "N/A",
                    risk_data=risk_data,
                )
                intervention = Intervention(
                    student_id=student.id,
                    risk_level=risk_data["risk_level"],
                    risk_score=risk_data["risk_score"],
                    risk_explanation=risk_data["risk_explanation"],
                    parent_sms=drafts["parent_sms"],
                    counselor_alert=drafts["counselor_alert"],
                    meeting_agenda=drafts["meeting_agenda"],
                )
                db.add(intervention)

        # Also seed LOW risk students with basic analysis
        for student in db_students:
            metrics = compute_student_metrics(student)
            from ai import compute_local_risk
            local = compute_local_risk(
                metrics["attendance_rate"],
                metrics["avg_score"],
                metrics["fee_overdue_months"]
            )
            if local["risk_level"] == "LOW":
                risk_data = await analyze_student_risk(metrics)
                intervention = Intervention(
                    student_id=student.id,
                    risk_level=risk_data["risk_level"],
                    risk_score=risk_data["risk_score"],
                    risk_explanation=risk_data["risk_explanation"],
                    parent_sms="",
                    counselor_alert="",
                    meeting_agenda="",
                )
                db.add(intervention)

        db.commit()
        print("✅ Initial risk analysis complete")

    except Exception as e:
        print(f"Seed error: {e}")
        db.rollback()
    finally:
        db.close()


# ─────────────────────────────────────────────────────────────────────────────
# Mount API Router (both with /api prefix and without)
# ─────────────────────────────────────────────────────────────────────────────
app.include_router(api, prefix="/api")
app.include_router(api)


# ─────────────────────────────────────────────────────────────────────────────
# Serve React Frontend (Render one-service deployment) — MUST BE LAST
# ─────────────────────────────────────────────────────────────────────────────
if os.path.exists(FRONTEND_BUILD):
    # Mount assets folder
    assets_dir = os.path.join(FRONTEND_BUILD, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_react(full_path: str):
        # If specific static file exists in dist (e.g. manifest.json, sw.js, favicon.svg)
        if full_path:
            file_path = os.path.join(FRONTEND_BUILD, full_path)
            if os.path.exists(file_path) and os.path.isfile(file_path):
                return FileResponse(file_path)
        return FileResponse(os.path.join(FRONTEND_BUILD, "index.html"))

