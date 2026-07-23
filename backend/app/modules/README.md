# Backend modules

Each domain package owns its models and will later own its API, schemas, services,
and repositories. The current implementation includes the identity and organization
models required by the first database migration plus basic JWT authentication.

The question package now provides the V1 question bank. Paper, exam, attempt, and
result packages remain placeholders.
