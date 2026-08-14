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
    InterventionOut, RetentionUpdate,
    StudentRiskSummary, DashboardOut, DropoutStagesBreakdown, ConsecutiveAbsenceAlert,
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
    sorted_records = sorted(records, key=lambda x: x.date)
    total = len(sorted_records)
    present = sum(1 for r in sorted_records if r.present)
    attendance_rate = (present / total * 100) if total > 0 else 100.0

    # Calculate consecutive_absences: Count consecutive present == False ending on latest attendance record date
    consecutive_absences = 0
    for r in reversed(sorted_records):
        if not r.present:
            consecutive_absences += 1
        else:
            break

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

    recent_att = [r.present for r in sorted_records[-10:]]

    # Calculate dropout_stage (int 1-4, or 0 if none)
    # Stage 4 (Imminent Dropout): 3+ consecutive absences AND avg score < 40% AND fee overdue >= 2 months
    # Stage 3 (Family/Fee Hesitation): Attendance < 60% AND fee overdue >= 2 months
    # Stage 2 (Academic Slip): Attendance < 65% AND avg score < 50%
    # Stage 1 (Absenteeism Spike): 2+ consecutive absences OR attendance 65-75%
    if consecutive_absences >= 3 and avg_score < 40.0 and fee_overdue >= 2:
        dropout_stage = 4
    elif attendance_rate < 60.0 and fee_overdue >= 2:
        dropout_stage = 3
    elif attendance_rate < 65.0 and avg_score < 50.0:
        dropout_stage = 2
    elif consecutive_absences >= 2 or (65.0 <= attendance_rate <= 75.0):
        dropout_stage = 1
    else:
        dropout_stage = 0

    return {
        "name": student.name,
        "grade": student.grade,
        "attendance_rate": round(attendance_rate, 1),
        "avg_score": round(avg_score, 1),
        "fee_overdue_months": fee_overdue,
        "consecutive_absences": consecutive_absences,
        "dropout_stage": dropout_stage,
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
            "retention_status": getattr(latest, "retention_status", "AT_RISK") or "AT_RISK",
            "dropout_stage": getattr(latest, "dropout_stage", 1) or 1,
            "urdu_voice_script": getattr(latest, "urdu_voice_script", None),
        }
    return {
        "risk_level": "UNKNOWN",
        "risk_score": 0,
        "last_analysis": None,
        "retention_status": "AT_RISK",
        "dropout_stage": 0,
        "urdu_voice_script": None,
    }



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


@api.post("/students/bulk-seed")
async def bulk_seed_students(db: Session = Depends(get_db)):
    """
    Bulk seed 35 realistic Pakistani student profiles with attendance, scores, fees,
    and AI risk analysis with personalized bilingual (Urdu/English) parent messages.
    """
    from ai import compute_local_risk

    seed_profiles = [
        {"name": "Fatima Noor", "grade": "8", "guardian_name": "Tariq Noor", "guardian_phone": "0300-1112233", "att_rate": 45.0, "avg_score": 32.0, "fee_pattern": ["paid", "overdue", "overdue", "overdue"]},
        {"name": "Zainab Bibi", "grade": "7", "guardian_name": "Ghulam Murtaza", "guardian_phone": "0312-2223344", "att_rate": 95.0, "avg_score": 88.0, "fee_pattern": ["paid", "paid", "paid", "paid"]},
        {"name": "Mariam Akhtar", "grade": "9", "guardian_name": "Akhtar Hussain", "guardian_phone": "0333-3334455", "att_rate": 62.0, "avg_score": 54.0, "fee_pattern": ["paid", "paid", "pending", "pending"]},
        {"name": "Hira Shah", "grade": "6", "guardian_name": "Syed Ali Shah", "guardian_phone": "0345-4445566", "att_rate": 92.0, "avg_score": 85.0, "fee_pattern": ["paid", "paid", "paid", "paid"]},
        {"name": "Bakhtawar Ali", "grade": "10", "guardian_name": "Liaquat Ali", "guardian_phone": "0321-5556677", "att_rate": 48.0, "avg_score": 35.0, "fee_pattern": ["paid", "paid", "overdue", "overdue"]},
        {"name": "Aisha Tariq", "grade": "8", "guardian_name": "Tariq Mehmood", "guardian_phone": "0301-6667788", "att_rate": 78.0, "avg_score": 72.0, "fee_pattern": ["paid", "paid", "paid", "pending"]},
        {"name": "Rimsha Parveen", "grade": "7", "guardian_name": "Parvez Ahmad", "guardian_phone": "0315-7778899", "att_rate": 52.0, "avg_score": 42.0, "fee_pattern": ["paid", "overdue", "overdue", "overdue"]},
        {"name": "Sana Malik", "grade": "6", "guardian_name": "Malik Farooq", "guardian_phone": "0334-8889900", "att_rate": 88.0, "avg_score": 79.0, "fee_pattern": ["paid", "paid", "paid", "paid"]},
        {"name": "Tayyaba Gul", "grade": "9", "guardian_name": "Gul Muhammad", "guardian_phone": "0302-9990011", "att_rate": 65.0, "avg_score": 58.0, "fee_pattern": ["paid", "paid", "pending", "pending"]},
        {"name": "Sumaira Parveen", "grade": "10", "guardian_name": "Muhammad Aslam", "guardian_phone": "0313-1011122", "att_rate": 46.0, "avg_score": 28.0, "fee_pattern": ["paid", "overdue", "overdue", "overdue"]},
        {"name": "Bushra Bibi", "grade": "8", "guardian_name": "Muhammad Ramzan", "guardian_phone": "0322-2122233", "att_rate": 96.0, "avg_score": 91.0, "fee_pattern": ["paid", "paid", "paid", "paid"]},
        {"name": "Sadia Kiran", "grade": "7", "guardian_name": "Kiran Shahzad", "guardian_phone": "0335-3233344", "att_rate": 58.0, "avg_score": 49.0, "fee_pattern": ["paid", "paid", "pending", "overdue"]},
        {"name": "Nimra Khan", "grade": "6", "guardian_name": "Imran Khan", "guardian_phone": "0346-4344455", "att_rate": 84.0, "avg_score": 76.0, "fee_pattern": ["paid", "paid", "paid", "paid"]},
        {"name": "Laiba Tariq", "grade": "9", "guardian_name": "Tariq Jamil", "guardian_phone": "0303-5455566", "att_rate": 70.0, "avg_score": 64.0, "fee_pattern": ["paid", "paid", "paid", "pending"]},
        {"name": "Aliza Shah", "grade": "10", "guardian_name": "Shahbaz Ahmed", "guardian_phone": "0314-6566677", "att_rate": 98.0, "avg_score": 92.0, "fee_pattern": ["paid", "paid", "paid", "paid"]},
        {"name": "Mahnoor Abbas", "grade": "8", "guardian_name": "Abbas Raza", "guardian_phone": "0323-7677788", "att_rate": 50.0, "avg_score": 38.0, "fee_pattern": ["paid", "paid", "overdue", "overdue"]},
        {"name": "Kinza Farooq", "grade": "7", "guardian_name": "Farooq Azam", "guardian_phone": "0336-8788899", "att_rate": 90.0, "avg_score": 82.0, "fee_pattern": ["paid", "paid", "paid", "paid"]},
        {"name": "Sidra Tul Ain", "grade": "6", "guardian_name": "Ain ul Haq", "guardian_phone": "0347-9899900", "att_rate": 64.0, "avg_score": 55.0, "fee_pattern": ["paid", "paid", "pending", "pending"]},
        {"name": "Iqra Batool", "grade": "9", "guardian_name": "Batool Hassan", "guardian_phone": "0304-0900011", "att_rate": 92.0, "avg_score": 86.0, "fee_pattern": ["paid", "paid", "paid", "paid"]},
        {"name": "Rubab Fatima", "grade": "10", "guardian_name": "Fatima Tu Zahra", "guardian_phone": "0316-1011122", "att_rate": 47.0, "avg_score": 31.0, "fee_pattern": ["paid", "overdue", "overdue", "overdue"]},
        {"name": "Sobia Parveen", "grade": "8", "guardian_name": "Parvez Iqbal", "guardian_phone": "0324-2122233", "att_rate": 75.0, "avg_score": 68.0, "fee_pattern": ["paid", "paid", "paid", "pending"]},
        {"name": "Farah Naz", "grade": "7", "guardian_name": "Nazir Ahmed", "guardian_phone": "0337-3233344", "att_rate": 55.0, "avg_score": 44.0, "fee_pattern": ["paid", "paid", "overdue", "overdue"]},
        {"name": "Uzma Bibi", "grade": "6", "guardian_name": "Bibi Gul", "guardian_phone": "0348-4344455", "att_rate": 94.0, "avg_score": 89.0, "fee_pattern": ["paid", "paid", "paid", "paid"]},
        {"name": "Humaira Yasmeen", "grade": "9", "guardian_name": "Yasmeen Arshad", "guardian_phone": "0305-5455566", "att_rate": 68.0, "avg_score": 61.0, "fee_pattern": ["paid", "paid", "pending", "pending"]},
        {"name": "Khadija Tul Kubra", "grade": "10", "guardian_name": "Kubra Shafi", "guardian_phone": "0317-6566677", "att_rate": 89.0, "avg_score": 83.0, "fee_pattern": ["paid", "paid", "paid", "paid"]},
        {"name": "Komal Akhtar", "grade": "8", "guardian_name": "Akhtar Nawaz", "guardian_phone": "0325-7677788", "att_rate": 51.0, "avg_score": 39.0, "fee_pattern": ["paid", "overdue", "overdue", "overdue"]},
        {"name": "Nadia Bibi", "grade": "7", "guardian_name": "Habibullah", "guardian_phone": "0338-8788899", "att_rate": 91.0, "avg_score": 84.0, "fee_pattern": ["paid", "paid", "paid", "paid"]},
        {"name": "Nida Fatima", "grade": "6", "guardian_name": "Muhammad Asif", "guardian_phone": "0349-9899900", "att_rate": 61.0, "avg_score": 52.0, "fee_pattern": ["paid", "paid", "pending", "pending"]},
        {"name": "Saman Shahzadi", "grade": "9", "guardian_name": "Shahzad Gul", "guardian_phone": "0306-0900011", "att_rate": 97.0, "avg_score": 90.0, "fee_pattern": ["paid", "paid", "paid", "paid"]},
        {"name": "Syeda Maryam", "grade": "10", "guardian_name": "Syed Kazim", "guardian_phone": "0318-1011122", "att_rate": 49.0, "avg_score": 34.0, "fee_pattern": ["paid", "paid", "overdue", "overdue"]},
        {"name": "Tanzila Bibi", "grade": "8", "guardian_name": "Tanveer Ahmed", "guardian_phone": "0326-2122233", "att_rate": 76.0, "avg_score": 70.0, "fee_pattern": ["paid", "paid", "paid", "pending"]},
        {"name": "Zahra Batool", "grade": "7", "guardian_name": "Batool Zahid", "guardian_phone": "0339-3233344", "att_rate": 57.0, "avg_score": 46.0, "fee_pattern": ["paid", "paid", "pending", "overdue"]},
        {"name": "Tehmina Kausar", "grade": "6", "guardian_name": "Kausar Parveen", "guardian_phone": "0350-4344455", "att_rate": 93.0, "avg_score": 87.0, "fee_pattern": ["paid", "paid", "paid", "paid"]},
        {"name": "Zunaira Riaz", "grade": "9", "guardian_name": "Riaz Hussain", "guardian_phone": "0307-5455566", "att_rate": 66.0, "avg_score": 57.0, "fee_pattern": ["paid", "paid", "pending", "pending"]},
        {"name": "Bisma Noor", "grade": "10", "guardian_name": "Noor Muhammad", "guardian_phone": "0319-6566677", "att_rate": 45.0, "avg_score": 30.0, "fee_pattern": ["paid", "overdue", "overdue", "overdue"]}
    ]

    try:
        # Determine starting roll number to avoid collisions
        existing = db.query(Student).all()
        max_num = 0
        for s in existing:
            if s.roll_number and s.roll_number.startswith("GS-"):
                try:
                    num = int(s.roll_number.replace("GS-", ""))
                    if num > max_num:
                        max_num = num
                except ValueError:
                    pass
        if max_num == 0:
            max_num = len(existing)

        today = datetime.utcnow()
        subjects = ["Urdu", "Math", "Science", "English", "Islamiat"]
        months = ["March", "April", "May", "June"]

        created_count = 0

        for idx, prof in enumerate(seed_profiles):
            roll = f"GS-{(max_num + idx + 1):03d}"
            student = Student(
                name=prof["name"],
                grade=prof["grade"],
                roll_number=roll,
                guardian_name=prof["guardian_name"],
                guardian_phone=prof["guardian_phone"]
            )
            db.add(student)
            db.flush()

            # 1. Attendance records (20 days)
            target_present = int(round(20 * (prof["att_rate"] / 100.0)))
            for day_i in range(20):
                date = today - timedelta(days=20 - day_i)
                is_present = day_i < target_present
                att_record = AttendanceRecord(
                    student_id=student.id,
                    date=date,
                    present=is_present
                )
                db.add(att_record)

            # 2. Score records (5 subjects)
            base_score = prof["avg_score"]
            score_offsets = [-4.0, 3.0, -2.0, 5.0, -2.0]
            for s_idx, subj in enumerate(subjects):
                date = today - timedelta(days=18 - s_idx * 3)
                score_val = max(10.0, min(100.0, base_score + score_offsets[s_idx]))
                score_record = ScoreRecord(
                    student_id=student.id,
                    date=date,
                    subject=subj,
                    score=round(score_val, 1),
                    max_score=100.0,
                    test_type="Monthly Test"
                )
                db.add(score_record)

            # 3. Fee records (4 months)
            for m_idx, status in enumerate(prof["fee_pattern"]):
                fee_record = FeeRecord(
                    student_id=student.id,
                    month=months[m_idx],
                    year=2025,
                    status=status,
                    amount=500.0,
                    paid_date=today - timedelta(days=30 * (3 - m_idx)) if status == "paid" else None
                )
                db.add(fee_record)

            db.flush()

            # 4. Metrics & Risk Analysis
            metrics = compute_student_metrics(student)
            risk_data = compute_local_risk(
                metrics["attendance_rate"],
                metrics["avg_score"],
                metrics["fee_overdue_months"]
            )

            risk_level = risk_data["risk_level"]
            risk_score = risk_data["risk_score"]
            signals = risk_data["signals"]
            signals_str = " | ".join(signals) if signals else "No major risk signals detected."

            # Generate personalized Urdu/English parent messages
            if risk_level == "HIGH":
                parent_sms = (
                    f"محترم {prof['guardian_name']}، {prof['name']} (کلاس {prof['grade']}) کی حاضری ({metrics['attendance_rate']:.0f}%) "
                    f"اور ٹیسٹ رزلٹ ({metrics['avg_score']:.0f}%) پر فوری توجہ درکار ہے۔ برائے کرم اسکول انتظامیہ سے رابطہ کریں۔ "
                    f"[Dear {prof['guardian_name']}, {prof['name']} (Grade {prof['grade']}) requires urgent attention. Att: {metrics['attendance_rate']:.0f}%, Avg: {metrics['avg_score']:.0f}%. Please contact Ustaad's Eye School.]"
                )[:160]
                counselor_alert = (
                    f"CRITICAL RISK ALERT: {prof['name']} (Grade {prof['grade']}). "
                    f"Signals: {signals_str}. Attendance rate is {metrics['attendance_rate']:.1f}% and academic average is {metrics['avg_score']:.1f}%. "
                    f"Guardian {prof['guardian_name']} ({prof['guardian_phone']}) should be contacted immediately."
                )
                meeting_agenda = (
                    f"• 1. Welcome & introduction with {prof['guardian_name']}\n"
                    f"• 2. Discuss {prof['name']}'s attendance concern ({metrics['attendance_rate']:.0f}%)\n"
                    f"• 3. Review failing score trends ({metrics['avg_score']:.0f}%)\n"
                    f"• 4. Address fee status ({metrics['latest_fee_status']})\n"
                    f"• 5. Establish customized daily tutoring and attendance tracking plan"
                )
            elif risk_level == "MEDIUM":
                parent_sms = (
                    f"محترم {prof['guardian_name']}، {prof['name']} (کلاس {prof['grade']}) کی کارکردگی میں بہتری کی ضرورت ہے "
                    f"(حاضری: {metrics['attendance_rate']:.0f}%)۔ برائے کرم اسکول سے رابطہ رکھیں۔ "
                    f"[Dear {prof['guardian_name']}, {prof['name']} (Grade {prof['grade']}) needs performance support. Att: {metrics['attendance_rate']:.0f}%. Ustaad's Eye School.]"
                )[:160]
                counselor_alert = (
                    f"MEDIUM RISK WARNING: {prof['name']} (Grade {prof['grade']}). "
                    f"Signals: {signals_str}. Attendance: {metrics['attendance_rate']:.1f}%, Score Avg: {metrics['avg_score']:.1f}%. "
                    f"Follow up with student and guardian."
                )
                meeting_agenda = (
                    f"• 1. Greeting and positive feedback for {prof['name']}\n"
                    f"• 2. Review areas needing academic improvement\n"
                    f"• 3. Discuss regular attendance goals\n"
                    f"• 4. Agree on bi-weekly progress updates"
                )
            else:
                parent_sms = (
                    f"محترم {prof['guardian_name']}، {prof['name']} (کلاس {prof['grade']}) کی کارکردگی بہت عمدہ ہے "
                    f"(حاضری: {metrics['attendance_rate']:.0f}%، نمبرز: {metrics['avg_score']:.0f}%)۔ استاد کی نظر اسکول۔ "
                    f"[Dear {prof['guardian_name']}, {prof['name']} (Grade {prof['grade']}) is performing excellently! Att: {metrics['attendance_rate']:.0f}%. Ustaad's Eye School.]"
                )[:160]
                counselor_alert = (
                    f"LOW RISK (ON TRACK): {prof['name']} (Grade {prof['grade']}). "
                    f"Performing well with {metrics['attendance_rate']:.1f}% attendance and {metrics['avg_score']:.1f}% test average."
                )
                meeting_agenda = (
                    f"• 1. Commend {prof['name']} for outstanding dedication\n"
                    f"• 2. Encourage participation in extracurricular activities\n"
                    f"• 3. Set goals for upcoming term exams"
                )

            risk_explanation = (
                f"{prof['name']} (Grade {prof['grade']}) is assessed as {risk_level} risk (score: {risk_score}/100). "
                f"Attendance: {metrics['attendance_rate']:.1f}%, Test Avg: {metrics['avg_score']:.1f}%. {signals_str}"
            )

            intervention = Intervention(
                student_id=student.id,
                risk_level=risk_level,
                risk_score=risk_score,
                risk_explanation=risk_explanation,
                parent_sms=parent_sms,
                counselor_alert=counselor_alert,
                meeting_agenda=meeting_agenda
            )
            db.add(intervention)
            created_count += 1

        db.commit()

        return {
            "status": "success",
            "count": created_count,
            "message": f"Successfully seeded {created_count} realistic student records with AI risk analysis!"
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to bulk seed students: {str(e)}")


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
        consecutive_absences=metrics["consecutive_absences"],
    )

    intervention = Intervention(
        student_id=student_id,
        risk_level=risk_data["risk_level"],
        risk_score=risk_data["risk_score"],
        risk_explanation=risk_data["risk_explanation"],
        parent_sms=intervention_drafts["parent_sms"],
        counselor_alert=intervention_drafts["counselor_alert"],
        meeting_agenda=intervention_drafts["meeting_agenda"],
        urdu_voice_script=intervention_drafts.get("urdu_voice_script", ""),
        dropout_stage=metrics["dropout_stage"] or 1,
        retention_status="AT_RISK",
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


@api.patch("/interventions/{intervention_id}/retention", response_model=InterventionOut)
def update_intervention_retention(intervention_id: int, req: RetentionUpdate, db: Session = Depends(get_db)):
    intervention = db.query(Intervention).filter(Intervention.id == intervention_id).first()
    if not intervention:
        raise HTTPException(status_code=404, detail="Intervention not found")

    valid_statuses = {"AT_RISK", "OUTREACH_SENT", "RECOVERING", "SAVED_RETAINED"}
    if req.retention_status not in valid_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid retention_status. Must be one of: {', '.join(valid_statuses)}"
        )

    intervention.retention_status = req.retention_status
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
            "retention_status": getattr(li, "retention_status", "AT_RISK") or "AT_RISK",
            "dropout_stage": getattr(li, "dropout_stage", 1) or 1,
            "urdu_voice_script": getattr(li, "urdu_voice_script", None),
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
@api.get("/dashboard", response_model=DashboardOut)
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
            "consecutive_absences": metrics["consecutive_absences"],
            "dropout_stage": metrics["dropout_stage"],
            "retention_status": latest_risk["retention_status"],
        })

    summaries.sort(key=lambda x: x["risk_score"], reverse=True)

    high = sum(1 for s in summaries if s["risk_level"] == "HIGH")
    medium = sum(1 for s in summaries if s["risk_level"] == "MEDIUM")
    low = sum(1 for s in summaries if s["risk_level"] in ("LOW", "UNKNOWN"))

    dropout_stages = DropoutStagesBreakdown(
        stage1_count=sum(1 for s in summaries if s["dropout_stage"] == 1),
        stage2_count=sum(1 for s in summaries if s["dropout_stage"] == 2),
        stage3_count=sum(1 for s in summaries if s["dropout_stage"] == 3),
        stage4_count=sum(1 for s in summaries if s["dropout_stage"] == 4),
    )

    consecutive_absence_alerts = [
        ConsecutiveAbsenceAlert(
            student_id=s["student_id"],
            name=s["name"],
            grade=s["grade"],
            consecutive_absences=s["consecutive_absences"],
            dropout_stage=s["dropout_stage"],
            guardian_phone=s["guardian_phone"],
        )
        for s in summaries
        if s["consecutive_absences"] >= 2
    ]
    consecutive_absence_alerts.sort(key=lambda x: x.consecutive_absences, reverse=True)

    saved_students_count = sum(1 for s in summaries if s["retention_status"] == "SAVED_RETAINED")

    return DashboardOut(
        total_students=len(students),
        high_risk=high,
        medium_risk=medium,
        low_risk=low,
        dropout_stages=dropout_stages,
        consecutive_absence_alerts=consecutive_absence_alerts,
        saved_students_count=saved_students_count,
        students=summaries,
    )




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
                    consecutive_absences=metrics["consecutive_absences"],
                )
                ret_stat = "OUTREACH_SENT" if local["risk_level"] == "MEDIUM" else "AT_RISK"
                intervention = Intervention(
                    student_id=student.id,
                    risk_level=risk_data["risk_level"],
                    risk_score=risk_data["risk_score"],
                    risk_explanation=risk_data["risk_explanation"],
                    parent_sms=drafts["parent_sms"],
                    counselor_alert=drafts["counselor_alert"],
                    meeting_agenda=drafts["meeting_agenda"],
                    urdu_voice_script=drafts.get("urdu_voice_script", ""),
                    dropout_stage=metrics["dropout_stage"] or 1,
                    retention_status=ret_stat,
                )
                db.add(intervention)

        # Also seed LOW risk students with basic analysis and SAVED_RETAINED status
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
                drafts = await draft_intervention(
                    student_name=student.name,
                    grade=student.grade,
                    guardian_name=student.guardian_name or "Guardian",
                    guardian_phone=student.guardian_phone or "N/A",
                    risk_data=risk_data,
                    consecutive_absences=metrics["consecutive_absences"],
                )
                intervention = Intervention(
                    student_id=student.id,
                    risk_level=risk_data["risk_level"],
                    risk_score=risk_data["risk_score"],
                    risk_explanation=risk_data["risk_explanation"],
                    parent_sms=drafts["parent_sms"],
                    counselor_alert=drafts["counselor_alert"],
                    meeting_agenda=drafts["meeting_agenda"],
                    urdu_voice_script=drafts.get("urdu_voice_script", ""),
                    dropout_stage=metrics["dropout_stage"] or 1,
                    retention_status="SAVED_RETAINED",
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
                # Long cache for hashed static assets
                if full_path.startswith("assets/"):
                    return FileResponse(file_path, headers={"Cache-Control": "public, max-age=31536000, immutable"})
                return FileResponse(file_path)
        return FileResponse(
            os.path.join(FRONTEND_BUILD, "index.html"),
            headers={"Cache-Control": "no-cache, no-store, must-revalidate, max-age=0"}
        )

