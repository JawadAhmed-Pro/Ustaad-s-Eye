import os
import json
from dotenv import load_dotenv
import google.generativeai as genai

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

if GEMINI_API_KEY and GEMINI_API_KEY != "your_gemini_api_key_here":
    genai.configure(api_key=GEMINI_API_KEY)
    # Default model can be configured via GEMINI_MODEL environment variable
    MODEL_NAME = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
    try:
        model = genai.GenerativeModel(MODEL_NAME)
    except Exception:
        model = genai.GenerativeModel("gemini-1.5-flash")
    AI_ENABLED = True
else:
    AI_ENABLED = False


def compute_local_risk(attendance_rate: float, avg_score: float, fee_overdue_months: int) -> dict:
    """
    Local fallback risk engine — no API needed.
    Returns risk_score (0-100) and triggered signals.
    """
    score = 0
    signals = []

    # Attendance signal (0-40 pts)
    if attendance_rate < 50:
        score += 40
        signals.append(f"Critical attendance: only {attendance_rate:.0f}% present")
    elif attendance_rate < 65:
        score += 28
        signals.append(f"Low attendance: {attendance_rate:.0f}%")
    elif attendance_rate < 75:
        score += 15
        signals.append(f"Below-average attendance: {attendance_rate:.0f}%")

    # Academic signal (0-35 pts)
    if avg_score < 35:
        score += 35
        signals.append(f"Failing scores: average {avg_score:.0f}%")
    elif avg_score < 50:
        score += 22
        signals.append(f"Very low scores: average {avg_score:.0f}%")
    elif avg_score < 60:
        score += 10
        signals.append(f"Below-passing scores: average {avg_score:.0f}%")

    # Fee signal (0-25 pts)
    if fee_overdue_months >= 3:
        score += 25
        signals.append(f"Fee overdue for {fee_overdue_months} months")
    elif fee_overdue_months == 2:
        score += 15
        signals.append("Fee delayed for 2 months")
    elif fee_overdue_months == 1:
        score += 8
        signals.append("Fee pending for current month")

    risk_level = "LOW"
    if score >= 55:
        risk_level = "HIGH"
    elif score >= 25:
        risk_level = "MEDIUM"

    return {
        "risk_score": min(score, 100),
        "risk_level": risk_level,
        "signals": signals,
    }


async def analyze_student_risk(student_data: dict) -> dict:
    """
    Uses Gemini AI (or local fallback) to analyze a student's dropout risk.

    student_data: {
        name, grade,
        attendance_rate (float %),
        avg_score (float %),
        fee_overdue_months (int),
        recent_attendance (list of last 10 days: bool),
        recent_scores (list of last 5 scores: float),
        fee_history (list of last 3 months: str paid/pending/overdue)
    }
    """
    local = compute_local_risk(
        student_data.get("attendance_rate", 100),
        student_data.get("avg_score", 100),
        student_data.get("fee_overdue_months", 0),
    )

    if not AI_ENABLED:
        explanation = (
            f"{student_data['name']} has been flagged as {local['risk_level']} risk. "
            + " | ".join(local["signals"])
            if local["signals"]
            else f"{student_data['name']} is currently on track with no major warning signs."
        )
        return {
            "risk_level": local["risk_level"],
            "risk_score": local["risk_score"],
            "risk_explanation": explanation,
            "signals": local["signals"],
        }

    prompt = f"""
You are an expert education analyst helping a Pakistani government school identify students at risk of dropping out.

Analyze the following student data and provide a risk assessment:

Student: {student_data['name']}, Grade {student_data['grade']}

DATA SIGNALS:
- Overall attendance rate: {student_data.get('attendance_rate', 'N/A')}%
- Recent 10-day attendance (True=present): {student_data.get('recent_attendance', [])}
- Overall average score: {student_data.get('avg_score', 'N/A')}%
- Last 5 test scores (% of max): {student_data.get('recent_scores', [])}
- Fee overdue months: {student_data.get('fee_overdue_months', 0)}
- Fee payment history (last 3 months): {student_data.get('fee_history', [])}

Local risk engine score: {local['risk_score']}/100 ({local['risk_level']})
Triggered signals: {', '.join(local['signals']) if local['signals'] else 'None'}

Instructions:
1. Analyze TRENDS not just individual data points. Is the situation getting worse over time?
2. Look for combinations: attendance + scores + fees together are more alarming than any single signal.
3. Consider the Pakistani school context: fee delays often indicate financial hardship that leads to dropout.

Respond in this EXACT JSON format (no markdown, just JSON):
{{
  "risk_level": "HIGH" or "MEDIUM" or "LOW",
  "risk_score": <number 0-100>,
  "risk_explanation": "<2-3 sentence plain English explanation for a teacher, mentioning the specific pattern you see>",
  "signals": ["<signal 1>", "<signal 2>", ...]
}}
"""

    try:
        response = model.generate_content(prompt)
        text = response.text.strip()
        # Strip markdown fences if present
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        result = json.loads(text.strip())
        return result
    except Exception as e:
        print(f"Gemini error: {e}, falling back to local engine")
        explanation = (
            f"{student_data['name']} has been flagged as {local['risk_level']} risk. "
            + " | ".join(local["signals"])
            if local["signals"]
            else f"{student_data['name']} shows no major warning signs currently."
        )
        return {
            "risk_level": local["risk_level"],
            "risk_score": local["risk_score"],
            "risk_explanation": explanation,
            "signals": local["signals"],
        }


async def draft_intervention(student_name: str, grade: str, guardian_name: str,
                              guardian_phone: str, risk_data: dict) -> dict:
    """
    Uses Gemini AI to draft a parent SMS, counselor alert, and meeting agenda.
    Falls back to template-based drafts if AI is unavailable.
    """
    risk_level = risk_data.get("risk_level", "MEDIUM")
    explanation = risk_data.get("risk_explanation", "")
    signals = risk_data.get("signals", [])

    if not AI_ENABLED:
        return _template_intervention(student_name, grade, guardian_name, guardian_phone, risk_level, signals)

    prompt = f"""
You are helping a Pakistani government school create intervention communications for a student at dropout risk.

Student: {student_name}, Grade {grade}
Guardian: {guardian_name}, Phone: {guardian_phone}
Risk Level: {risk_level}
Risk Explanation: {explanation}
Warning Signals: {', '.join(signals)}

Generate three communications in this EXACT JSON format (no markdown):
{{
  "parent_sms": "<Short SMS in English for parent/guardian, empathetic and action-oriented, max 160 chars, mention school name 'Ustaad's Eye School'>",
  "counselor_alert": "<Alert message for school counselor/admin, professional, lists specific signals and recommends action, 3-4 sentences>",
  "meeting_agenda": "<Bullet-point agenda for a follow-up meeting with parent, 4-5 items covering: greeting, sharing data, understanding home situation, support plan, follow-up date>"
}}

Keep the tone warm and supportive — the goal is to help the student, not shame the family.
"""

    try:
        response = model.generate_content(prompt)
        text = response.text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        result = json.loads(text.strip())
        return result
    except Exception as e:
        print(f"Gemini draft error: {e}, using templates")
        return _template_intervention(student_name, grade, guardian_name, guardian_phone, risk_level, signals)


def _template_intervention(name, grade, guardian_name, phone, risk_level, signals):
    urgency = "urgently" if risk_level == "HIGH" else "soon"
    return {
        "parent_sms": (
            f"Dear {guardian_name}, {name} (Grade {grade}) needs {urgency} support. "
            f"Please contact Ustaad's Eye School at your earliest. We care about {name}'s future."
        )[:160],
        "counselor_alert": (
            f"ALERT [{risk_level} RISK]: {name}, Grade {grade}. "
            f"Warning signals detected: {', '.join(signals) if signals else 'Multiple signals'}. "
            f"Immediate counselor outreach recommended. Guardian: {guardian_name} ({phone})."
        ),
        "meeting_agenda": (
            "• Welcome and introduction\n"
            "• Share attendance, score, and fee data with parent\n"
            "• Listen to family's current situation and challenges\n"
            "• Agree on a support plan (scholarships, flexible fee, tutoring)\n"
            "• Set follow-up date within 1 week"
        ),
    }
