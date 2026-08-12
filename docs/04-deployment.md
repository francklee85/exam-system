# 在线考试系统 V1 部署与运维

## 1. 架构与环境要求

V1 只要求一台安装 Docker Engine 与 Docker Compose v2 的 Linux 主机。浏览器只访问
Nginx 暴露的统一入口：

```text
Browser → frontend(Nginx:80) → /api → backend(FastAPI:8000) → mysql(MySQL 8.4)
```

MySQL 和 Backend 不向宿主机发布端口；容器之间通过 Compose 内部网络使用
`mysql:3306` 与 `backend:8000` 通信。

## 2. 首次部署

```bash
cp .env.example .env
```

部署前必须修改 `.env` 中所有 `CHANGE_ME` 值。建议：

```bash
openssl rand -hex 32
openssl rand -base64 24
```

`JWT_SECRET_KEY` 至少 32 字符。`INITIAL_ADMIN_PASSWORD` 至少 12 字符，并应使用独立
强密码。生产配置会拒绝示例占位 Secret 和管理员密码。若数据库密码含 URL 保留字符，
`MYSQL_PASSWORD` 写真实值，`DATABASE_URL` 中的密码部分需进行 URL 编码。

检查配置并启动：

```bash
docker compose config
docker compose up -d --build --wait
docker compose ps
```

首次启动时 Backend 在 MySQL healthcheck 通过后依次运行：

```text
alembic upgrade head
python -m app.scripts.seed
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

浏览器访问 `http://服务器地址/`。`/healthz` 检查 Nginx，`/health` 经应用入口检查
FastAPI。默认 Seed 创建或修复 `admin`、`teacher`、`student` 三个角色和四个初始
专业，并按环境变量创建管理员；Seed 可重复执行，不覆盖已有管理员密码。

> Migration 是单 Backend 的部署初始化动作。未来扩容多个 Backend 副本时，应改为
> 独立 migration job，不能让多个实例并发执行迁移。

## 3. 状态、日志、重启与停止

```bash
docker compose ps
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f mysql
docker compose restart
docker compose stop
docker compose up -d
```

Backend 和 Nginx 日志输出到 stdout/stderr，由 Docker 收集。

`docker compose down` 删除容器和网络但保留 `mysql_data`，再次启动数据仍在。
`docker compose down -v` 会删除数据库卷，只能用于明确需要清空数据库的测试环境。

## 4. Migration 与 Seed 维护命令

正常启动会自动执行两者。需要显式检查时：

```bash
docker compose exec backend alembic current
docker compose exec backend alembic check
docker compose exec backend python -m app.scripts.seed
```

第二次执行 Seed 不应产生重复角色、专业或管理员。

## 5. 版本升级

升级前先备份数据库：

```bash
./scripts/backup-db.sh
git pull
docker compose build
docker compose up -d --wait
docker compose ps
```

Backend 新容器启动时应用全部待执行 Migration，再运行幂等 Seed。查看 Backend 日志
确认 revision 成功后再进行业务验收。生产升级应先在备份副本或预发布环境演练。

## 6. MySQL 备份

Docker named volume 只提供容器重建后的数据持久化，不能替代数据库备份。备份脚本在
MySQL 容器内执行 `mysqldump`，宿主机无需安装 MySQL 客户端：

```bash
./scripts/backup-db.sh
./scripts/backup-db.sh /安全的外部备份目录
```

默认生成权限受限的 `backups/backup-YYYYMMDD-HHMMSS.sql`。应将备份定期复制到与
部署主机故障域不同的位置，并验证可恢复性。

若使用非默认环境文件：

```bash
ENV_FILE=/path/to/production.env ./scripts/backup-db.sh /backup/location
```

## 7. MySQL 恢复

恢复会覆盖当前数据库，必须安排停写窗口。流程：

1. 核对目标环境、SQL 文件与磁盘空间。
2. 执行当前数据库备份。
3. 停止 Frontend/Backend 写入。
4. 导入 SQL。
5. 启动 Backend，让 Alembic 升至当前 head 并运行 Seed。
6. 检查 revision、健康状态、登录和关键业务数据。

脚本会要求输入数据库名确认，并自动额外生成一次 pre-restore 安全备份：

```bash
./scripts/restore-db.sh backups/backup-20260725-120000.sql
```

已在自动化运维环境完成独立审核后才可使用非交互确认：

```bash
./scripts/restore-db.sh backups/backup-20260725-120000.sql --yes
```

恢复完成后：

```bash
docker compose exec backend alembic current
docker compose ps
```

## 8. 本地开发

默认 Compose 是生产式镜像。需要宿主机运行 Backend/Frontend 时，可只启动 MySQL，
并临时发布数据库端口，或使用本机 MySQL；宿主机 Backend 的 `DATABASE_URL` 应指向
`127.0.0.1`。Vite 开发服务器会把相对 `/api` 代理到 `http://localhost:8000`。
不要把生产 `.env` 打入镜像或提交 Git。

## 9. 常见故障

- **Backend 未启动**：先看 `docker compose ps` 和 MySQL health，再看
  `docker compose logs backend` 中的连接、Migration 或生产 Secret 校验错误。
- **管理员不能登录**：确认首次 Seed 日志、用户名以及用户状态；Seed 不覆盖已有密码。
- **深层 URL 刷新 404**：确认使用仓库提供的 Nginx 配置，`try_files` 会回退到
  `/index.html`。
- **API 404**：Nginx 的 `proxy_pass http://backend:8000` 不带尾斜杠，保留完整
  `/api/...` 路径。
- **中文写入失败**：确认 MySQL 命令行参数和 `DATABASE_URL` 均使用 `utf8mb4`。
- **Frontend 页面显示网络错误**：检查 Backend health 和 Nginx `/api` 代理日志；
  Frontend 不依赖 `localhost:8000` 硬编码。
- **端口 80 被占用**：在 `.env` 设置 `APP_PORT=8080`，再访问对应端口。
