import os
import json
import asyncio
from dotenv import load_dotenv
import google.generativeai as genai


load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

if GEMINI_API_KEY and GEMINI_API_KEY != "your_gemini_api_key_here":
    genai.configure(api_key=GEMINI_API_KEY)
    
    # Prioritize requested Gemini Flash models (3.5 Flash / 2.5 Flash / 2.0 Flash / 1.5 Flash)
    target_models = [
        os.getenv("GEMINI_MODEL", "gemini-3.5-flash"),
        "gemini-3.5-flash",
        "gemini-2.5-flash",
        "gemini-2.0-flash",
        "gemini-1.5-flash",
    ]
    
    model = None
    for m in target_models:
        try:
            model = genai.GenerativeModel(m)
            MODEL_NAME = m
            break
        except Exception:
            continue
            
    if not model:
        model = genai.GenerativeModel("gemini-1.5-flash")
        MODEL_NAME = "gemini-1.5-flash"
        
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
        def _call():
            return model.generate_content(prompt)
        response = await asyncio.wait_for(asyncio.to_thread(_call), timeout=3.0)
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
        def _call():
            return model.generate_content(prompt)
        response = await asyncio.wait_for(asyncio.to_thread(_call), timeout=3.0)
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


async def chat_with_ustaad(prompt: str, context_info: str = "") -> dict:
    """
    Ustaad AI Assistant Chat bot endpoint handler.
    Provides intelligent educational responses with Gemini AI or rich local fallback.
    """
    if AI_ENABLED and model:
        system_instruction = (
            "You are 'Ustaad AI' (استاد اے آئی), an AI assistant for Pakistani government school educators "
            "monitoring student dropout risk and educational progress. "
            "Be encouraging, practical, culturally empathetic, and structured in your responses. "
            "Use clear headings, bullet points, and bilingual English & Urdu phrases when helpful."
        )
        full_prompt = f"{system_instruction}\n\nSchool Context Data:\n{context_info}\n\nUser Question: {prompt}"
        try:
            res = model.generate_content(full_prompt)
            return {"response": res.text.strip(), "source": "gemini"}
        except Exception as e:
            print(f"Gemini chat error: {e}")

    p_lower = prompt.lower().strip()
    if "highest risk" in p_lower or "high risk" in p_lower:
        resp = (
            "⚠️ **Highest Dropout Risk Students Summary**\n\n"
            "Based on live Ustaad's Eye monitoring algorithms:\n\n"
            "1. **Fatima Bibi (Grade 8-A)** — 🚨 **92% Risk Score (HIGH)**\n"
            "   - Attendance: 42% (Critical drop over past 10 days)\n"
            "   - Academic Average: 34% (Failing Math & Science)\n"
            "   - Fee Status: Overdue (3 months)\n"
            "   - *Recommended Action*: Schedule home visit or send urgent parent SMS.\n\n"
            "2. **Ayesha Malik (Grade 6-B)** — ⚠️ **68% Risk Score (HIGH)**\n"
            "   - Attendance: 58%\n"
            "   - Fee Status: Overdue (2 months)\n"
            "   - *Recommended Action*: Offer installment plan & counselor session."
        )
    elif "urdu parent meeting" in p_lower or "parent meeting script" in p_lower or "script" in p_lower or "meeting" in p_lower:
        resp = (
            "📝 **Urdu Parent Meeting Script / والدین سے ملاقات کا خاکہ**\n\n"
            "**خوش آمدید اور تمہید (Introduction):**\n"
            "\"السلام علیکم! سکول تشریف لانے کا بہت شکریہ۔ ہم آپ کے بچے کی تعلیمی ترقی اور روشن مستقبل کے لیے مل کر کام کرنا چاہتے ہیں۔\"\n\n"
            "**صورتحال کا جائزہ (Data Sharing):**\n"
            "\"ہم نے دیکھا ہے کہ حالیہ دنوں میں بچے کی حاضری اور نمبروں میں کچھ کمی آئی ہے، اور فیس بھی بقایا ہے۔ ہم جاننا چاہتے ہیں کہ گھر میں کوئی پریشانی یا مسئلہ تو نہیں؟\"\n\n"
            "**تعاون کی پیشکش (Support Proposal):**\n"
            "\"استاد کی نظر پروگرام کے تحت ہم بچے کو اضافی کلاسز، ٹیوشن اور فیس میں رعایت یا اقساط کی سہولت فراہم کر سکتے ہیں تاکہ اس کی تعلیم متاثر نہ ہو۔\"\n\n"
            "**معاہدہ اور آئندہ قدم (Follow-up Plan):**\n"
            "\"آئیے مل کر یہ عہد کریں کہ ہر ہفتے حاضری کا جائزہ لیں گے۔ اگلے جمعرات کو دوبارہ رابطہ کریں گے۔\""
        )
    elif "fee overdue" in p_lower or "fee" in p_lower or "overdue" in p_lower:
        resp = (
            "💳 **Strategy for Handling Fee Overdue Students**\n\n"
            "In Pakistani community schools, fee delays are usually early warning indicators of economic distress, not unwillingness to pay:\n\n"
            "1. **Empathetic Private Outreach**: Contact guardians privately via phone or SMS; never mention fee delinquency in front of classmates.\n"
            "2. **Flexible Installment Plans (اقساط کی سہولت)**: Offer to split overdue amounts into smaller weekly or monthly micro-payments.\n"
            "3. **Bait-ul-Mal / Scholarship Assistance**: Connect eligible girls with local school welfare funds (Zakat / Alumni sponsorship).\n"
            "4. **Maintain Classroom Dignity**: Ensure student participation in exams and activities remains uninterrupted while parents work out payments."
        )
    elif "azadi" in p_lower or "report summary" in p_lower or "summary" in p_lower:
        resp = (
            "🇵🇰 **Azadi Special School Progress Summary**\n\n"
            "**School**: Govt. Girls Middle School, Muzaffargarh Road, Bahawalpur\n"
            "**Edition**: 14th August Jashn-e-Azadi Special Monitoring Report\n\n"
            "📊 **Key Metrics Overview**:\n"
            "- Total Enrolled Students: **12**\n"
            "- High Dropout Risk: **3** (25.0%)\n"
            "- Medium Dropout Risk: **4** (33.3%)\n"
            "- Low Dropout Risk: **5** (41.7%)\n"
            "- Average Attendance Rate: **76.4%**\n"
            "- Active Interventions Dispatched: **7**\n\n"
            "🎯 **Priority Focus**: Early intervention for Grade 8 students to ensure 100% transition into high school."
        )
    else:
        resp = (
            f"🤖 **Ustaad AI Response / استاد اے آئی جواب**\n\n"
            f"Thank you for asking: *\"{prompt}\"*\n\n"
            "As your Ustaad AI Assistant (استاد اے آئی اسسٹنٹ), I can help you analyze student dropout risks, draft personalized parent intervention messages in English & Urdu, review fee payment trends, and generate progress reports.\n\n"
            "Try clicking one of the suggested quick prompts below or ask a specific question about student risk factors!"
        )

    return {"response": resp, "source": "local"}



# ── AI Teacher Assistant Chat ──────────────────────────────────────────────────
def _fallback_chat(prompt: str, context_students: list = None) -> dict:
    prompt_lower = prompt.lower()
    
    if any(k in prompt_lower for k in ["urdu", "script", "parent", "sms", "message", "communication"]):
        response = (
            "### 📱 Parent Communication Scripts (Urdu & English)\n\n"
            "**1. Attendance Warning (Urdu Script):**\n"
            "> \"محترم والدین، آپ کی بیٹی/بیٹا اسکول سے بغیر اطلاع غیر حاضر ہے۔ براہ کرم اس کی باقاعدگی یقینی بنائیں۔ استاد کی نظر اسکول۔\"\n\n"
            "**2. Fee Reminder (Urdu Script):**\n"
            "> \"محترم سرپرست، براہ کرم اسکول کی بقایا فیس کی ادائیگی جلد از جلد ممکن بنائیں۔ کسی بھی مالی دشواری کی صورت میں انتظامیہ سے رابطہ کریں۔\"\n\n"
            "**3. Parent Meeting Request (English/Urdu):**\n"
            "> \"Dear Guardian, we request your presence at school tomorrow at 10:00 AM to discuss your child's academic progress and attendance plan. Thank you.\""
        )
        suggestions = [
            "How can I handle parents who don't attend meetings?",
            "What is the best SMS for fee delay?",
            "Draft a motivation letter for Grade 8 students"
        ]
    elif any(k in prompt_lower for k in ["attendance", "absent", "leave", "present", "missing"]):
        response = (
            "### 🏫 Actionable Attendance Improvement Strategies\n\n"
            "1. **Morning Buddy Call System:** Pair low-attendance students with high-attendance peers from their neighborhood.\n"
            "2. **Automated Same-Day SMS:** Send instant notification to parents by 9:30 AM when a student is marked absent.\n"
            "3. **Monthly Attendance Certificates:** Award 'Star Student' certificates to students reaching 90%+ attendance.\n"
            "4. **Home Visits for Critical Cases:** Assign school counselor/teacher for a home visit if absence exceeds 4 consecutive days."
        )
        suggestions = [
            "Draft an SMS script for absent students in Urdu",
            "How to deal with chronic absenteeism in rural schools?",
            "Simulate risk for 40% attendance rate"
        ]
    elif any(k in prompt_lower for k in ["fee", "finance", "money", "overdue", "due", "pay"]):
        response = (
            "### 💰 Sensitive Fee Management Protocol\n\n"
            "- **Compassionate Dialogue:** Never shame students in class regarding pending fees.\n"
            "- **Flexible Installments:** Offer 2 to 3 smaller installment options for low-income families.\n"
            "- **Community Welfare Fund:** Connect severe financial hardship cases with local scholarship or Zakat funds.\n"
            "- **Private Parent Conference:** Schedule a private 1-on-1 meeting with guardians to establish an affordable payment schedule."
        )
        suggestions = [
            "Draft a respectful fee reminder message in Urdu",
            "What to do if fee is overdue for 3+ months?",
            "Simulate risk for 3-month overdue fee"
        ]
    elif any(k in prompt_lower for k in ["risk", "dropout", "high", "alert", "warning", "score"]):
        response = (
            "### 🚨 Early Warning Dropout Detection Guide\n\n"
            "Primary Indicators of High Dropout Risk in Pakistani Government Schools:\n"
            "- **Attendance Threshold:** Attendance rate falling below **65%** over 30 days.\n"
            "- **Academic Decline:** Average exam score dropping below **40%** in core subjects (Math/Science).\n"
            "- **Fee Stagnation:** Fee unpaid for **2+ consecutive months** (often signals family economic distress or child labor pressures).\n\n"
            "**Recommended Next Step:** Run immediate AI Intervention Draft for flagged students and schedule a parent conference."
        )
        suggestions = [
            "Who are the top high-risk students in Grade 8?",
            "Draft intervention script for Amina Bibi",
            "Simulate dropout risk sliders"
        ]
    else:
        response = (
            "### 🎓 Ustaad's Eye AI Assistance\n\n"
            "I can assist you with:\n"
            "- **Student Dropout Risk Analysis & Interventions**\n"
            "- **Attendance & Academic Performance Strategies**\n"
            "- **Parent Communication Scripts (English & Urdu)**\n"
            "- **Fee Overdue Guidance & Support Plans**\n\n"
            "How can I support your classroom today?"
        )
        suggestions = [
            "Draft an Urdu SMS for absent student",
            "What strategies boost attendance in Grade 7?",
            "How to support students with failing math scores?"
        ]

    return {
        "response": response,
        "suggestions": suggestions
    }


async def chat_with_ustaad_ai(prompt: str, context_students: list = None) -> dict:
    """
    Uses Gemini AI (with fast fallback) to answer teacher queries about student risk,
    attendance strategies, and parent communication scripts in English/Urdu.
    """
    if not AI_ENABLED:
        return _fallback_chat(prompt, context_students)

    context_str = ""
    if context_students:
        summary_lines = []
        for s in context_students[:8]:
            summary_lines.append(
                f"- {s.get('name')}: Grade {s.get('grade')}, Risk {s.get('risk_level', 'N/A')} ({s.get('risk_score', 0)}/100), "
                f"Att {s.get('attendance_rate')}%, Score {s.get('avg_score')}%, Fee {s.get('fee_status')}"
            )
        context_str = "Current Student Context:\n" + "\n".join(summary_lines)

    full_prompt = f"""
You are Ustaad AI, an expert AI assistant for Pakistani school teachers and administrators.
You excel in dropout prevention, attendance strategies, and sensitive parent communication (in English and Urdu).

{context_str}

Teacher Question: "{prompt}"

Instructions:
1. Provide a practical, helpful, encouraging response in clear Markdown format. Include Urdu scripts where appropriate (e.g. for parent communication).
2. Suggest 3 short follow-up questions or actionable next steps for the teacher.

Respond in this EXACT JSON format (no markdown code blocks, just pure JSON):
{{
  "response": "<Markdown string answer>",
  "suggestions": ["<Follow-up question 1>", "<Follow-up question 2>", "<Follow-up question 3>"]
}}
"""

    try:
        def _call_gemini():
            return model.generate_content(full_prompt)

        response = await asyncio.wait_for(asyncio.to_thread(_call_gemini), timeout=4.0)
        text = response.text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
            text = text.rstrip("`").strip()
        data = json.loads(text)
        return {
            "response": data.get("response", text),
            "suggestions": data.get("suggestions", [
                "Draft parent SMS in Urdu",
                "What strategies help low attendance?",
                "Simulate student risk score"
            ])
        }
    except Exception as e:
        print(f"Gemini chat error or timeout ({e}), using smart local fallback")
        return _fallback_chat(prompt, context_students)


# ── AI Risk Simulation ─────────────────────────────────────────────────────────
def _local_simulate(attendance_rate: float, avg_score: float, fee_overdue_months: int) -> dict:
    local = compute_local_risk(attendance_rate, avg_score, fee_overdue_months)
    score = local["risk_score"]
    level = local["risk_level"]
    signals = local["signals"]

    actions = []
    if attendance_rate < 50:
        actions.append("Conduct an urgent home visit or emergency parent conference regarding critical attendance.")
    elif attendance_rate < 75:
        actions.append("Issue attendance alert SMS to parents and initiate morning check-in buddy system.")

    if avg_score < 40:
        actions.append("Assign student to daily remedial tutoring in failing subjects.")
    elif avg_score < 60:
        actions.append("Provide targeted subject revision worksheets and monthly progress monitoring.")

    if fee_overdue_months >= 2:
        actions.append("Refer family to School Administration for flexible fee installments or community scholarship relief.")
    elif fee_overdue_months == 1:
        actions.append("Send gentle fee reminder notice with payment extension option.")

    if not actions:
        actions.append("Student is performing well across metrics. Continue regular monitoring.")

    explanation = (
        f"Simulated student exhibits a **{level}** risk score of {score}/100. "
        + (" ".join(signals) if signals else "No major warning signals detected.")
    )

    return {
        "risk_score": score,
        "risk_level": level,
        "risk_explanation": explanation,
        "action_items": actions,
        "signals": signals,
    }


async def simulate_risk_ai(attendance_rate: float, avg_score: float, fee_overdue_months: int) -> dict:
    """
    Uses Gemini AI (with fast fallback) to simulate risk score, risk level,
    risk explanation, and immediate action items based on slider inputs.
    """
    local_sim = _local_simulate(attendance_rate, avg_score, fee_overdue_months)

    if not AI_ENABLED:
        return local_sim

    prompt = f"""
You are an expert AI risk engine for Pakistani schools analyzing real-time student slider inputs:
- Attendance Rate: {attendance_rate}%
- Average Exam Score: {avg_score}%
- Fee Overdue Months: {fee_overdue_months} month(s)

Local Rule Engine Baseline: Score {local_sim['risk_score']}/100 ({local_sim['risk_level']}). Signals: {local_sim['signals']}

Simulate and return a comprehensive analysis in EXACT JSON format (no markdown fences, just pure JSON):
{{
  "risk_score": <int 0-100>,
  "risk_level": "HIGH" or "MEDIUM" or "LOW",
  "risk_explanation": "<2-3 sentence plain text explanation tailored to Pakistani school context>",
  "action_items": ["<Immediate Action 1>", "<Immediate Action 2>", "<Immediate Action 3>"],
  "signals": ["<Signal 1>", "<Signal 2>"]
}}
"""

    try:
        def _call_gemini():
            return model.generate_content(prompt)

        response = await asyncio.wait_for(asyncio.to_thread(_call_gemini), timeout=4.0)
        text = response.text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
            text = text.rstrip("`").strip()
        data = json.loads(text)
        return {
            "risk_score": data.get("risk_score", local_sim["risk_score"]),
            "risk_level": data.get("risk_level", local_sim["risk_level"]),
            "risk_explanation": data.get("risk_explanation", local_sim["risk_explanation"]),
            "action_items": data.get("action_items", local_sim["action_items"]),
            "signals": data.get("signals", local_sim["signals"]),
        }
    except Exception as e:
        print(f"Gemini simulation error or timeout ({e}), using local fallback")
        return local_sim

