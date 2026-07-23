from fastapi import HTTPException, status


class InvalidRequestError(HTTPException):
    def __init__(self, detail: str) -> None:
        super().__init__(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)


class ResourceNotFoundError(HTTPException):
    def __init__(self, detail: str) -> None:
        super().__init__(status_code=status.HTTP_404_NOT_FOUND, detail=detail)


class ResourceConflictError(HTTPException):
    def __init__(self, detail: str) -> None:
        super().__init__(status_code=status.HTTP_409_CONFLICT, detail=detail)


class SystemConfigurationError(HTTPException):
    def __init__(self, detail: str) -> None:
        super().__init__(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=detail)
