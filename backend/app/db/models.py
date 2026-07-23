"""Import all models so SQLAlchemy and Alembic share one complete metadata registry."""

from app.db.base import Base
from app.modules.classes.models import Class
from app.modules.majors.models import Major
from app.modules.questions.models import Question, QuestionOption
from app.modules.roles.models import Role, UserRole
from app.modules.students.models import StudentProfile
from app.modules.users.models import User

__all__ = [
    "Base",
    "Class",
    "Major",
    "Question",
    "QuestionOption",
    "Role",
    "StudentProfile",
    "User",
    "UserRole",
]
