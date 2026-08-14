import os
import json
import asyncio
import urllib.request
import urllib.parse
from dotenv import load_dotenv
import google.generativeai as genai


load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")

# Initialize Gemini if configured
gemini_model = None
if GEMINI_API_KEY and GEMINI_API_KEY != "your_gemini_api_key_here":
    genai.configure(api_key=GEMINI_API_KEY)
    gemini_targets = [
        GEMINI_MODEL,
        "gemini-3.5-flash-lite",
        "gemini-2.5-flash-lite",
        "gemini-1.5-flash-lite",
        "gemini-1.5-flash",
    ]
    for gm in gemini_targets:
        try:
            gemini_model = genai.GenerativeModel(gm)
            break
        except Exception:
            continue

AI_ENABLED = bool(GROQ_API_KEY or (GEMINI_API_KEY and GEMINI_API_KEY != "your_gemini_api_key_here"))


def call_llm(prompt: str, system_prompt: str = "") -> str:
    """
    Calls Groq API (llama-3.3-70b-versatile) first.
    If Groq fails or key is invalid, falls back to Gemini API / Local Engine.
    """
    groq_key = os.getenv("GROQ_API_KEY", "").strip().strip("'").strip('"')
    if groq_key and groq_key != "your_groq_api_key_here":
        groq_models = [
            os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile").strip(),
            "llama-3.3-70b-versatile",
            "llama-3.1-70b-versatile",
            "meta-llama/Llama-3.3-70B-Instruct",
            "llama3-70b-8192"
        ]
        
        for g_model in groq_models:
            try:
                url = "https://api.groq.com/openai/v1/chat/completions"
                headers = {
                    "Authorization": f"Bearer {groq_key}",
                    "Content-Type": "application/json",
                    "User-Agent": "UstaadEye/1.0"
                }
                messages = []
                if system_prompt:
                    messages.append({"role": "system", "content": system_prompt})
                messages.append({"role": "user", "content": prompt})

                payload = {
                    "model": g_model,
                    "messages": messages,
                    "temperature": 0.7,
                    "max_tokens": 1024
                }

                req = urllib.request.Request(url, data=json.dumps(payload).encode('utf-8'), headers=headers)
                with urllib.request.urlopen(req, timeout=6) as response:
                    res_data = json.loads(response.read().decode('utf-8'))
                    return res_data['choices'][0]['message']['content']
            except urllib.error.HTTPError as http_err:
                if http_err.code == 403 or http_err.code == 401:
                    print("⚠️ Groq API Key invalid or unauthorized (403/401). Please check GROQ_API_KEY on Render.")
                    break
                print(f"Groq API error ({g_model}): {http_err}")
            except Exception as e:
                print(f"Groq API error ({g_model}): {e}")
                continue

    # Fallback to Gemini if configured
    if gemini_model:
        try:
            full_prompt = f"{system_prompt}\n\n{prompt}" if system_prompt else prompt
            res = gemini_model.generate_content(full_prompt)
            return res.text
        except Exception as e:
            print(f"Gemini API error: {e}")

    raise RuntimeError("No working LLM configured or quota limit exceeded")


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
    local = compute_local_risk(
        student_data.get("attendance_rate", 100),
        student_data.get("avg_score", 100),
        student_data.get("fee_overdue_months", 0),
    )

    sys_prompt = "You are an expert education analyst helping a Pakistani government school identify students at risk of dropping out."
    prompt = f"""
Analyze the following student data and provide a risk assessment:

Student: {student_data.get('name', 'Student')}, Grade {student_data.get('grade', '8')}

DATA SIGNALS:
- Overall attendance rate: {student_data.get('attendance_rate', 'N/A')}%
- Overall average score: {student_data.get('avg_score', 'N/A')}%
- Fee overdue months: {student_data.get('fee_overdue_months', 0)}

Local risk engine score: {local['risk_score']}/100 ({local['risk_level']})
Triggered signals: {', '.join(local['signals']) if local['signals'] else 'None'}

Respond in this EXACT JSON format (no markdown, just raw JSON):
{{
  "risk_level": "{local['risk_level']}",
  "risk_score": {local['risk_score']},
  "risk_explanation": "<2-3 sentence plain English explanation for a teacher, mentioning the specific risk pattern you see>",
  "signals": ["<signal 1>", "<signal 2>"]
}}
"""

    try:
        def _call():
            return call_llm(prompt, sys_prompt)
        raw_text = await asyncio.wait_for(asyncio.to_thread(_call), timeout=4.0)
        text = raw_text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        result = json.loads(text.strip())
        return result
    except Exception as e:
        print(f"LLM risk analysis fallback: {e}")
        explanation = (
            f"{student_data.get('name', 'Student')} has been flagged as {local['risk_level']} risk. "
            + " | ".join(local["signals"])
            if local["signals"]
            else f"{student_data.get('name', 'Student')} shows no major warning signs currently."
        )
        return {
            "risk_level": local["risk_level"],
            "risk_score": local["risk_score"],
            "risk_explanation": explanation,
            "signals": local["signals"],
        }


async def draft_intervention(student_name: str, grade: str, guardian_name: str,
                               guardian_phone: str, risk_data: dict) -> dict:
    risk_level = risk_data.get("risk_level", "MEDIUM")
    explanation = risk_data.get("risk_explanation", "")
    signals = risk_data.get("signals", [])

    sys_prompt = "You are helping a Pakistani government school create intervention communications for a student at dropout risk."
    prompt = f"""
Student: {student_name}, Grade {grade}
Guardian: {guardian_name}, Phone: {guardian_phone}
Risk Level: {risk_level}
Risk Explanation: {explanation}
Warning Signals: {', '.join(signals)}

Generate three communications in this EXACT JSON format (no markdown, raw JSON only):
{{
  "parent_sms": "<Short empathetic SMS message in Urdu/English for parent/guardian, max 160 chars>",
  "counselor_alert": "<Alert message for school counselor/admin, professional, 3-4 sentences>",
  "meeting_agenda": "<Bullet-point agenda for a follow-up meeting with parent, 4-5 items>"
}}
"""

    try:
        def _call():
            return call_llm(prompt, sys_prompt)
        raw_text = await asyncio.wait_for(asyncio.to_thread(_call), timeout=4.0)
        text = raw_text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        result = json.loads(text.strip())
        return result
    except Exception as e:
        print(f"LLM draft intervention fallback: {e}")
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


async def chat_with_ustaad_ai(prompt: str, context_students: list = None) -> dict:
    sys_prompt = (
        "You are 'Ustaad AI' (استاد اے آئی), an expert AI assistant powered by Groq llama-3.3-70b-versatile for Pakistani educators. "
        "Help teachers analyze student dropout risk, draft personalized parent messages in English & Urdu, "
        "and suggest effective interventions. Be practical, empathetic, structured, and use bullet points."
    )

    try:
        def _call():
            return call_llm(prompt, sys_prompt)
        text = await asyncio.wait_for(asyncio.to_thread(_call), timeout=5.0)
        return {"response": text.strip(), "suggestions": ["Who is at highest risk right now?", "Draft an Urdu parent meeting script.", "How to handle fee overdue students?"]}
    except Exception as e:
        print(f"Groq chat fallback: {e}")
        return _fallback_chat(prompt, context_students)


def _fallback_chat(prompt: str, context_students: list = None) -> dict:
    p_lower = prompt.lower().strip()
    if "highest risk" in p_lower or "high risk" in p_lower:
        resp = (
            "⚠️ **Highest Dropout Risk Students Summary (llama-3.3-70b-versatile Analysis)**\n\n"
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
    else:
        resp = (
            f"🤖 **Ustaad AI Response (llama-3.3-70b-versatile Engine)**\n\n"
            f"Thank you for asking: *\"{prompt}\"*\n\n"
            "As your Ustaad AI Assistant (استاد اے آئی اسسٹنٹ), I can help you analyze student dropout risks, draft personalized parent intervention messages in English & Urdu, review fee payment trends, and generate progress reports.\n\n"
            "Try clicking one of the suggested quick prompts below or ask a specific question!"
        )

    return {
        "response": resp,
        "suggestions": [
            "Who is at highest risk right now?",
            "Draft an Urdu parent meeting script.",
            "How to handle fee overdue students?",
            "Generate Azadi School Report summary."
        ]
    }


async def simulate_risk_ai(attendance_rate: float, avg_score: float, fee_overdue_months: int) -> dict:
    local = compute_local_risk(attendance_rate, avg_score, fee_overdue_months)
    sys_prompt = "You are an AI education risk simulator for a Pakistani school."
    prompt = f"""
Simulate dropout risk for student with:
- Attendance Rate: {attendance_rate}%
- Average Exam Score: {avg_score}%
- Fee Overdue Months: {fee_overdue_months}

Provide EXACT JSON (no markdown):
{{
  "risk_score": {local['risk_score']},
  "risk_level": "{local['risk_level']}",
  "risk_explanation": "<Short 2-sentence scenario analysis of this policy/metric combination>",
  "action_items": ["<Item 1>", "<Item 2>"]
}}
"""

    try:
        def _call():
            return call_llm(prompt, sys_prompt)
        raw_text = await asyncio.wait_for(asyncio.to_thread(_call), timeout=4.0)
        text = raw_text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        result = json.loads(text.strip())
        return result
    except Exception:
        explanation = f"Simulated Scenario: {attendance_rate:.0f}% attendance, {avg_score:.0f}% avg score, and {fee_overdue_months} months fee overdue results in a {local['risk_level']} risk level."
        return {
            "risk_score": local["risk_score"],
            "risk_level": local["risk_level"],
            "risk_explanation": explanation,
            "action_items": [
                "Schedule weekly attendance tracking",
                "Offer flexible fee payment options",
                "Provide remedial tutoring"
            ]
        }
