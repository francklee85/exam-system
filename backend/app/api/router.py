from fastapi import APIRouter

from app.api.routes.auth import router as auth_router
from app.api.routes.classes import router as classes_router
from app.api.routes.health import router as health_router
from app.api.routes.majors import router as majors_router
from app.api.routes.questions import router as questions_router
from app.api.routes.students import router as students_router
from app.api.routes.teachers import router as teachers_router
from app.api.routes.users import router as users_router
from app.core.config import get_settings

api_router = APIRouter()
api_router.include_router(health_router)
api_v1_prefix = get_settings().api_v1_prefix
api_router.include_router(auth_router, prefix=api_v1_prefix)
api_router.include_router(majors_router, prefix=api_v1_prefix)
api_router.include_router(classes_router, prefix=api_v1_prefix)
api_router.include_router(teachers_router, prefix=api_v1_prefix)
api_router.include_router(students_router, prefix=api_v1_prefix)
api_router.include_router(users_router, prefix=api_v1_prefix)
api_router.include_router(questions_router, prefix=api_v1_prefix)
