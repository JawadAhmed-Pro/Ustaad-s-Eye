from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, Text, Boolean, ForeignKey
from sqlalchemy.orm import sessionmaker, relationship, DeclarativeBase
from datetime import datetime

DATABASE_URL = "sqlite:///./ustaad_eye.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

class Base(DeclarativeBase):
    pass


class Student(Base):
    __tablename__ = "students"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    grade = Column(String(20), nullable=False)
    roll_number = Column(String(20), unique=True)
    guardian_name = Column(String(100))
    guardian_phone = Column(String(20))
    created_at = Column(DateTime, default=datetime.utcnow)

    attendance_records = relationship("AttendanceRecord", back_populates="student", cascade="all, delete")
    score_records = relationship("ScoreRecord", back_populates="student", cascade="all, delete")
    fee_records = relationship("FeeRecord", back_populates="student", cascade="all, delete")
    interventions = relationship("Intervention", back_populates="student", cascade="all, delete")


class AttendanceRecord(Base):
    __tablename__ = "attendance_records"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"))
    date = Column(DateTime, nullable=False)
    present = Column(Boolean, default=True)
    notes = Column(Text, nullable=True)

    student = relationship("Student", back_populates="attendance_records")


class ScoreRecord(Base):
    __tablename__ = "score_records"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"))
    date = Column(DateTime, nullable=False)
    subject = Column(String(50), nullable=False)
    score = Column(Float, nullable=False)
    max_score = Column(Float, default=100.0)
    test_type = Column(String(50), default="Quiz")

    student = relationship("Student", back_populates="score_records")


class FeeRecord(Base):
    __tablename__ = "fee_records"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"))
    month = Column(String(20), nullable=False)
    year = Column(Integer, nullable=False)
    status = Column(String(20), default="pending")  # paid, pending, overdue
    amount = Column(Float, default=500.0)
    paid_date = Column(DateTime, nullable=True)

    student = relationship("Student", back_populates="fee_records")


class Intervention(Base):
    __tablename__ = "interventions"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"))
    created_at = Column(DateTime, default=datetime.utcnow)
    risk_level = Column(String(20))  # HIGH, MEDIUM, LOW
    risk_score = Column(Float)
    risk_explanation = Column(Text)
    parent_sms = Column(Text)
    counselor_alert = Column(Text)
    meeting_agenda = Column(Text)
    actioned = Column(Boolean, default=False)
    actioned_at = Column(DateTime, nullable=True)

    student = relationship("Student", back_populates="interventions")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_tables():
    Base.metadata.create_all(bind=engine)
