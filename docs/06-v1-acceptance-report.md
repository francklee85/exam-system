# 在线考试系统 V1.0 验收报告

## 1. 验收结论

V1.0 在隔离的空数据 Docker Compose 项目中完成部署、初始化、持久化、
备份恢复、自动化测试和完整浏览器业务闭环验收。

本报告所列必验项目均已通过。当前已达到 V1.0 发布标准。

## 2. 测试环境

- 验收日期：2026-07-25
- 操作系统时区：Asia/Shanghai
- Docker Client / Engine：26.1.5
- Docker Compose：v2.40.3
- Python 运行镜像：`python:3.12.10-slim-bookworm`
- Node 构建镜像：`node:22.14.0-alpine`
- Nginx 运行镜像：`nginx:1.27.4-alpine`
- MySQL：`mysql:8.4.5`
- 验收入口：`http://localhost:18080`
- 隔离 Compose project：`exam_v1_acceptance`

验收环境使用独立项目名、独立 named volume 和非默认端口，没有依赖宿主机
MySQL、已有表、已有测试账号、`.venv`、`node_modules` 或 Vite 开发服务器。
完成证据采集后已执行 `down -v` 销毁该隔离验收环境及测试数据，未触碰默认
Compose project 或用户现有数据库。

## 3. 服务与部署结果

| 服务 | 职责 | 对外端口 | 最终状态 |
| --- | --- | --- | --- |
| `mysql` | MySQL 8.4 数据库 | 不暴露 | healthy |
| `backend` | Migration、Seed、FastAPI | 不暴露 | healthy |
| `frontend` | React 静态文件、Nginx、API 反向代理 | 18080（正式默认 80） | healthy |

浏览器通过单一 Nginx 入口访问系统。`/api/` 原样代理到
`backend:8000`；深层 SPA 路由直接访问和刷新均返回 React 应用。

已验证 `/login`、`/dashboard`、`/questions`、`/papers`、`/exams`、
`/my-exams`、`/results`、`/403` 和未知前端路由。

## 4. 空数据库、Migration 与 Seed

- 从空 named volume 执行 `docker compose up -d --build`：通过。
- MySQL 首次初始化期间，Backend 等待 MySQL health：通过。
- 全部历史 Migration 从 base 升级到 head：通过。
- 当前 revision：`b6d8f0a2c4e7`。
- 独立临时库 `upgrade head -> downgrade -1 -> upgrade head`：通过。
- `alembic check`：`No new upgrade operations detected.`。
- 首次 Seed：创建 3 个角色、4 个初始专业和管理员。
- 第二次 Seed：不重复创建角色、专业或管理员，幂等验证通过。
- Backend 业务连接使用 `MYSQL_USER`，未使用 MySQL root。

验收过程中发现并修复了 MySQL 8.4 `caching_sha2_password` 首次认证所需
RSA 依赖未显式声明的问题。正式 Backend 依赖现已包含 `cryptography`，
镜像强制重建并创建新连接后保持 healthy。

## 5. 自动化测试

### Backend

- Ruff：通过。
- Python compileall：通过。
- Pytest 全量：`307 passed, 9 skipped`。
- 9 个 skip 均为需要显式开关和真实 MySQL 的专项用例。
- 真实 MySQL 专项：
  - 未 Seed 空库组织 API：`1 passed`。
  - Seed 后认证、关系、用户、题库、试卷、考试、Attempt：`8 passed`。
- MySQL 专项合计：`9 passed`。

### Frontend

- ESLint：通过。
- TypeScript：通过。
- Vitest：`29 files passed, 237 tests passed`。
- Vite production build：通过。
- 路由级动态导入已启用，各业务页已拆为独立 chunk。
- 仍有一个约 774 kB 的 Ant Design / React 公共依赖共享 chunk 警告；
  不影响构建和运行，列入技术债。

### Docker

- Backend image build：通过。
- Frontend multi-stage image build：通过。
- Compose build / up：通过。
- Backend 镜像以非 root 用户 `app` 运行。
- Frontend 最终镜像不包含 Node 运行环境。
- `.env`、`.git`、宿主 `.venv`、`node_modules`、测试缓存未进入镜像。

## 6. 完整浏览器 E2E

以下流程均通过真实 Nginx 入口、FastAPI、MySQL 执行：

1. 管理员登录、角色和基础导航。
2. 创建专业、班级、教师、学生，并验证专业班级关系。
3. 教师创建单选、多选、判断、填空、主观问答五种题型。
4. Markdown 粘贴预览、`.md` 上传、代码块、五种题型、逐题错误定位、
   合法项导入和非法项跳过。
5. 五种题型加入试卷、独立分值、总分、排序、移除关联和状态锁定。
6. 创建并编辑考试草稿、班级/专业/全部学生目标、发布和只读快照。
7. 学生查看考试、开始唯一 Attempt、五种题型作答、自动保存、
   刷新恢复、重复开始恢复原 Attempt。
8. 混合考试正式交卷，客观题自动评分，人工题进入待阅卷。
9. 教师对填空和主观题给部分分，最终成绩和及格状态自动汇总。
10. 学生查看最终成绩，教师查看考试成绩。
11. 纯客观考试交卷后立即完成评分，不进入人工阅卷。

在线答题 E2E 中发现并修复了一个真实 UI 缺陷：快速从单选题切换到多选题
时，React 可能复用输入 DOM 状态。题目渲染现以
`exam_question_id` 作为组件 key，并新增回归测试。

## 7. 权限与安全验收

- admin：全局管理组织、题库、试卷、考试、成绩和阅卷，通过。
- teacher：仅管理自己的题目、试卷、考试、成绩和阅卷，通过。
- student：仅访问我的考试、在线答题和我的成绩，通过。
- student 直接访问 `/questions`、`/papers`、`/exams`：403，通过。
- 他人资源所有权和 Backend RBAC 回归：通过。
- Student API 全程仅使用 `ExamQuestion` Snapshot：通过。
- `StudentExamQuestionResponse` OpenAPI 仅包含：
  `exam_question_id`、`question_type`、`content`、`options`、`score`、
  `sort_order`、`saved_answer`。
- OpenAPI 和实际学生响应均不包含 `correct_answer`、
  `reference_answer`、`analysis`、`original_question_id`、
  `is_correct`、`score_awarded`。
- 发布后修改原 Question / Paper，已发布考试快照保持不变：通过。
- 未发现 `dangerouslySetInnerHTML`，当前 Markdown 导入内容按普通文本展示。
- 密码继续使用 Argon2 哈希，API 不返回密码哈希。
- 生产配置拒绝 `DEBUG=true`、占位 JWT Secret 和占位管理员密码。
- 未发现生产代码中的硬编码 JWT Secret 或真实密码。
- Nginx 已设置基础安全响应头和 2 MB 上传上限。
- 非白名单 Origin 不返回 CORS 允许头。

## 8. 持久化、备份与恢复

- `docker compose restart` 后数据保留：通过。
- `docker compose down`（不带 `-v`）再启动，数据保留：通过。
- 验收时保留并核对了 25 场考试、5 个已评分 Attempt 和 Alembic head，
  证明 named volume 正常。
- `docker compose down -v` 仅用于空环境验收和明确删除数据。

备份实测：

- 使用 `scripts/backup-db.sh` 生成 mysqldump。
- 实测文件大小：77,391 bytes。

恢复实测：

1. 备份后创建专用标记数据。
2. 使用 `scripts/restore-db.sh --yes`。
3. 脚本自动执行恢复前安全备份并停止业务写入。
4. 导入完成后恢复服务。
5. 标记数据消失，证明数据库回到备份时点。
6. 三容器恢复 healthy，Alembic revision 仍为 head。

恢复实测中发现并修复了脚本直接 `source .env` 时无法处理带空格
`APP_NAME` 的问题；脚本现仅安全读取需要的数据库变量。

named volume 仅提供容器生命周期内的数据持久化，不替代外部 mysqldump
和定期异地备份。

## 9. 日志与运行规范

- Backend 和 Nginx 日志输出到 stdout/stderr。
- 三个服务均使用 `restart: unless-stopped`。
- 生产 Backend 不启用 `--reload`。
- MySQL、Backend、Frontend 均有 healthcheck。
- MySQL 与 Backend 不暴露宿主端口，仅 Nginx 暴露统一入口。
- MySQL 使用 `utf8mb4` / `utf8mb4_0900_ai_ci`，中文、Emoji 和多行文本验证通过。

## 10. 已知问题与技术债

以下项目不阻塞 V1.0：

1. Vite 仍报告一个约 774 kB 的公共依赖 chunk。业务路由已完成懒加载，
   后续可评估更细的 vendor 拆分。
2. React Router v6 测试输出 v7 future flag 提示。未在 V1 收尾阶段升级
   major version。
3. jsdom 下 Ant Design TextArea 有一次 `NaN height` 测试环境警告；
   浏览器 E2E 未复现功能问题。
4. `npm audit` 在当前受限环境中因代理客户端异常
   `HttpsProxyAgent is not a constructor` 未能完成在线审计；未据此执行
   高风险依赖大版本升级。
5. Compose 提供 HTTP 单机入口；正式公网部署仍应在外层接入 TLS 证书和
   HTTPS 终止。

候选新需求已记录在 `docs/05-v1.1-roadmap.md`，本轮未实现。

## 11. V1.0 发布判定

空数据库部署、三容器健康、管理员初始化、组织管理、五种题型、
Markdown 导入、人工组卷、考试发布快照、学生在线考试、自动保存、
刷新恢复、正式交卷、自动评分、人工阅卷、最终成绩、RBAC、防泄露、
持久化和备份恢复均已通过。

结论：**达到 V1.0 发布标准。**
