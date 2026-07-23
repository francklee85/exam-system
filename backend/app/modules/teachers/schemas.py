from app.modules.users.schemas import UserCreateInput, UserIdentityInput, UserResponse


class TeacherCreate(UserCreateInput):
    pass


class TeacherUpdate(UserIdentityInput):
    pass


class TeacherResponse(UserResponse):
    pass
