"""Import all models so SQLAlchemy and Alembic share one complete metadata registry."""

from app.db.base import Base
from app.modules.attempts.models import ExamAnswer, ExamAttempt
from app.modules.classes.models import Class
from app.modules.exams.models import Exam, ExamQuestion, ExamTarget
from app.modules.majors.models import Major
from app.modules.papers.models import Paper, PaperQuestion
from app.modules.questions.models import Question, QuestionOption
from app.modules.roles.models import Role, UserRole
from app.modules.students.models import StudentProfile
from app.modules.users.models import User

__all__ = [
    "Base",
    "Class",
    "ExamAnswer",
    "ExamAttempt",
    "Exam",
    "ExamQuestion",
    "ExamTarget",
    "Major",
    "Paper",
    "PaperQuestion",
    "Question",
    "QuestionOption",
    "Role",
    "StudentProfile",
    "User",
    "UserRole",
]
