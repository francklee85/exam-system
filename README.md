# 在线考试系统

在线考试系统 V1。当前阶段包含前后端项目骨架、数据库连接基础设施、
身份与组织基础数据模型、首个 Alembic Migration、基础数据 Seed、JWT 登录认证
和健康检查。尚未实现 CRUD API、题库、试卷、考试、作答或成绩等业务功能。

## 技术栈

- 后端：Python 3.12、FastAPI、SQLAlchemy 2.x、Pydantic v2、Alembic
- 认证：Argon2 密码哈希、JWT Bearer Token
- 前端：React、Vite、TypeScript、Ant Design、React Router、Axios、Zustand
- 数据库：MySQL 8
- 权限规划：JWT 登录基础已完成，RBAC 接口权限控制待后续实现
- 部署方向：Docker Compose + Nginx

## 项目结构

```text
.
├── backend/
│   ├── alembic/            # 数据库迁移环境与版本脚本
│   ├── app/
│   │   ├── api/            # HTTP 路由
│   │   ├── core/           # 配置等横切能力
│   │   ├── db/             # SQLAlchemy Base、引擎和会话
│   │   ├── modules/        # 按领域划分的模型与后续业务模块
│   │   └── scripts/        # Seed 等维护脚本
│   └── tests/
├── frontend/
│   └── src/
│       ├── api/            # Axios 客户端和后续 API 封装
│       ├── app/            # 应用级配置和路由
│       ├── components/     # 通用组件
│       ├── hooks/          # 通用 Hooks
│       ├── layouts/        # 页面布局
│       ├── pages/          # 路由页面
│       ├── stores/         # Zustand 状态
│       ├── styles/         # 全局样式
│       └── types/          # 共享 TypeScript 类型
├── docs/
├── .env.example
└── docker-compose.yml
```

## 环境要求

- Python 3.12
- Node.js 20+
- Docker 与 Docker Compose

## 本地启动

### 1. 准备环境变量和 MySQL

```bash
cp .env.example .env
```

`.env.example` 中只有开发占位密码。首次启动前请仅在本地 `.env` 中修改
`MYSQL_PASSWORD`、`MYSQL_ROOT_PASSWORD`，并同步更新 `DATABASE_URL` 中的密码。
`.env` 已被 Git 忽略。

`JWT_SECRET_KEY` 和 `INITIAL_ADMIN_PASSWORD` 的示例值只能用于本地开发。
部署到其他环境前必须替换为独立的高强度值。

```bash
docker compose up -d mysql
docker compose ps
```

### 2. 启动后端

```bash
cd backend
python3.12 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
alembic upgrade head
python -m app.scripts.seed
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

访问 <http://localhost:8000/health>，预期返回：

```json
{"status":"ok"}
```

交互式 API 文档位于 <http://localhost:8000/docs>。

认证接口：

- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`

### 3. 启动前端

打开另一个终端：

```bash
cd frontend
npm install
npm run dev
```

访问 <http://localhost:5173>。

## 基础验证

后端：

```bash
cd backend
source .venv/bin/activate
pytest -q
ruff check app tests alembic/env.py
alembic heads
```

前端：

```bash
cd frontend
npm run lint
npm run build
```

Compose 配置：

```bash
docker compose --env-file .env.example config
```

## 数据库迁移约定

所有数据库结构变更都必须通过 Alembic 管理。新增模型后，在 `backend` 目录执行：

```bash
alembic revision --autogenerate -m "describe change"
alembic upgrade head
```

当前首个 revision 为 `3c899a842c89`，只创建：`users`、`roles`、
`user_roles`、`majors`、`classes`、`student_profiles`。

## 初始化基础数据

数据库迁移完成后，在 `backend` 目录执行：

```bash
python -m app.scripts.seed
```

该命令按角色或专业的 `code` 查询并补齐数据，不依赖固定 ID，可重复执行。
它会创建或恢复为启用状态的默认角色 `admin`、`teacher`、`student`，以及专业
`CLOUD`、`AI_MEDIA`、`AIGC`、`NETOPS`。

当环境变量 `INITIAL_ADMIN_USERNAME` 和 `INITIAL_ADMIN_PASSWORD` 同时存在时，
Seed 还会创建对应管理员并按角色 `code=admin` 建立关联。如果同名用户已存在，
Seed 不会覆盖其密码，只会补齐缺失的 admin 角色。Seed 不在应用启动时自动运行。
