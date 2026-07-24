# 在线考试系统 V1 数据库设计

## 1. 设计目标

本数据库设计用于支持在线考试系统 V1，包括：

* 用户与角色管理
* 专业、班级和学生归属管理
* 题库管理
* 试卷管理
* 考试发布
* 按全部学生、专业或班级分配考试
* 考试题目快照
* 学生在线作答
* 客观题自动评分与人工题阅卷状态设计
* 成绩查询

数据库技术栈：

* MySQL 8
* SQLAlchemy 2.x
* Alembic

所有数据库结构变更必须通过 Alembic Migration 管理。

---

## 2. 核心表清单

### 2.1 用户与组织

* users
* roles
* user_roles
* majors
* classes
* student_profiles

### 2.2 题库与试卷

* questions
* question_options
* papers
* paper_questions

### 2.3 考试

* exams
* exam_targets
* exam_questions

### 2.4 作答与成绩

* exam_attempts
* exam_answers

共 15 张核心表。

---

# 3. users 用户表

## 3.1 作用

保存所有可以登录系统的用户：

* 管理员
* 教师
* 学生

学生特有字段不直接放在 users 表中，而放在 student_profiles。

## 3.2 字段

| 字段            | 类型           | 约束                 | 说明     |
| ------------- | ------------ | ------------------ | ------ |
| id            | BIGINT       | PK, AUTO_INCREMENT | 用户主键   |
| username      | VARCHAR(50)  | NOT NULL, UNIQUE   | 登录用户名  |
| password_hash | VARCHAR(255) | NOT NULL           | 密码哈希   |
| real_name     | VARCHAR(50)  | NOT NULL           | 真实姓名   |
| status        | VARCHAR(20)  | NOT NULL           | 用户状态   |
| last_login_at | DATETIME     | NULL               | 最后登录时间 |
| created_at    | DATETIME     | NOT NULL           | 创建时间   |
| updated_at    | DATETIME     | NOT NULL           | 更新时间   |

## 3.3 状态

```text
active
disabled
```

禁用后：

* 不允许登录
* 历史考试和成绩保留

---

# 4. roles 角色表

## 4.1 作用

保存系统角色。

V1 默认：

```text
admin
teacher
student
```

## 4.2 字段

| 字段          | 类型           | 约束                 | 说明   |
| ----------- | ------------ | ------------------ | ---- |
| id          | BIGINT       | PK, AUTO_INCREMENT | 主键   |
| code        | VARCHAR(50)  | NOT NULL, UNIQUE   | 角色编码 |
| name        | VARCHAR(50)  | NOT NULL           | 角色名称 |
| description | VARCHAR(255) | NULL               | 描述   |
| status      | VARCHAR(20)  | NOT NULL           | 状态   |
| created_at  | DATETIME     | NOT NULL           | 创建时间 |
| updated_at  | DATETIME     | NOT NULL           | 更新时间 |

业务代码必须按 `code` 判断角色，不允许写死 role_id。

---

# 5. user_roles 用户角色关系表

## 5.1 作用

支持用户和角色多对多关系。

例如一个用户未来可以同时拥有：

```text
teacher
admin
```

## 5.2 字段

| 字段         | 类型       | 约束                 | 说明    |
| ---------- | -------- | ------------------ | ----- |
| id         | BIGINT   | PK, AUTO_INCREMENT | 主键    |
| user_id    | BIGINT   | NOT NULL, FK       | 用户 ID |
| role_id    | BIGINT   | NOT NULL, FK       | 角色 ID |
| created_at | DATETIME | NOT NULL           | 创建时间  |

约束：

```text
UNIQUE(user_id, role_id)
```

外键：

```text
user_roles.user_id → users.id
user_roles.role_id → roles.id
```

---

# 6. majors 专业表

## 6.1 作用

保存专业方向。

初始数据：

* 云计算
* AI数媒
* AIGC
* 网络运维

不得写死在代码中。

## 6.2 字段

| 字段          | 类型           | 约束                 | 说明   |
| ----------- | ------------ | ------------------ | ---- |
| id          | BIGINT       | PK, AUTO_INCREMENT | 主键   |
| name        | VARCHAR(100) | NOT NULL, UNIQUE   | 专业名称 |
| code        | VARCHAR(50)  | NOT NULL, UNIQUE   | 专业编码 |
| description | VARCHAR(500) | NULL               | 描述   |
| status      | VARCHAR(20)  | NOT NULL           | 状态   |
| created_at  | DATETIME     | NOT NULL           | 创建时间 |
| updated_at  | DATETIME     | NOT NULL           | 更新时间 |

建议编码：

```text
CLOUD
AI_MEDIA
AIGC
NETOPS
```

---

# 7. classes 班级表

## 7.1 作用

保存班级。

关系：

```text
Major
  ↓
Class
```

## 7.2 字段

| 字段              | 类型           | 约束                 | 说明   |
| --------------- | ------------ | ------------------ | ---- |
| id              | BIGINT       | PK, AUTO_INCREMENT | 主键   |
| major_id        | BIGINT       | NOT NULL, FK       | 所属专业 |
| name            | VARCHAR(100) | NOT NULL           | 班级名称 |
| code            | VARCHAR(50)  | NOT NULL, UNIQUE   | 班级编码 |
| enrollment_year | SMALLINT     | NULL               | 入学年份 |
| description     | VARCHAR(500) | NULL               | 描述   |
| status          | VARCHAR(20)  | NOT NULL           | 状态   |
| created_at      | DATETIME     | NOT NULL           | 创建时间 |
| updated_at      | DATETIME     | NOT NULL           | 更新时间 |

外键：

```text
classes.major_id → majors.id
```

---

# 8. student_profiles 学生档案表

## 8.1 作用

保存学生专属信息：

* 学号
* 当前班级

关系：

```text
User
  ↓
StudentProfile
  ↓
Class
  ↓
Major
```

## 8.2 字段

| 字段         | 类型          | 约束                   | 说明    |
| ---------- | ----------- | -------------------- | ----- |
| id         | BIGINT      | PK, AUTO_INCREMENT   | 主键    |
| user_id    | BIGINT      | NOT NULL, UNIQUE, FK | 用户 ID |
| student_no | VARCHAR(50) | NOT NULL, UNIQUE     | 学号    |
| class_id   | BIGINT      | NOT NULL, FK         | 当前班级  |
| created_at | DATETIME    | NOT NULL             | 创建时间  |
| updated_at | DATETIME    | NOT NULL             | 更新时间  |

外键：

```text
student_profiles.user_id → users.id
student_profiles.class_id → classes.id
```

不保存 `major_id`。

专业通过：

```text
student_profiles.class_id
→ classes.major_id
→ majors.id
```

获取。

---

# 9. 用户与组织总体关系

```text
roles
  ↑
user_roles
  ↑
users
  ↓
student_profiles
  ↓
classes
  ↓
majors
```

---

# 10. questions 题目表

## 10.1 作用

保存题目主体。

V1 支持五种题型：

* `single_choice`：单选题，自动阅卷
* `multiple_choice`：多选题，自动阅卷
* `true_false`：判断题，自动阅卷
* `fill_blank`：填空题，人工阅卷
* `subjective`：主观问答题，人工阅卷

## 10.2 字段

| 字段             | 类型          | 约束                 | 说明   |
| -------------- | ----------- | ------------------ | ---- |
| id             | BIGINT      | PK, AUTO_INCREMENT | 主键   |
| question_type  | VARCHAR(20) | NOT NULL           | 题型   |
| content        | TEXT        | NOT NULL           | 题干   |
| correct_answer | JSON        | NULL               | 自动阅卷标准答案 |
| reference_answer | TEXT      | NULL               | 人工阅卷参考答案 |
| analysis       | TEXT        | NULL               | 答案解析 |
| difficulty     | VARCHAR(20) | NOT NULL           | 难度   |
| status         | VARCHAR(20) | NOT NULL           | 状态   |
| created_by     | BIGINT      | NOT NULL, FK       | 创建人  |
| created_at     | DATETIME    | NOT NULL           | 创建时间 |
| updated_at     | DATETIME    | NOT NULL           | 更新时间 |

题型：

```text
single_choice
multiple_choice
true_false
fill_blank
subjective
```

难度：

```text
easy
medium
hard
```

状态：

```text
active
disabled
```

外键：

```text
questions.created_by → users.id
```

---

# 11. correct_answer 与 reference_answer 设计

`correct_answer` 仅用于自动阅卷题，统一使用 JSON 数组。

单选：

```json
["A"]
```

多选：

```json
["A", "C", "D"]
```

判断：

```json
["true"]
```

或：

```json
["false"]
```

多选评分时按集合比较，不考虑顺序。

自动阅卷题必须拥有合法的 `correct_answer`，且
`reference_answer = NULL`。

人工阅卷题不使用自动评分标准：

```text
correct_answer = NULL
```

不得使用空数组 `[]` 代替空值。`fill_blank` 和 `subjective` 可以保存
可选的 `reference_answer`，供教师阅卷参考，但系统不得根据该字段自动判分。
`reference_answer` 允许为空。

`reference_answer` 是教师评分时参考的作答内容；`analysis` 是知识解析和解题说明，
两者语义不同，不得混用。

由于旧 Schema 要求 `correct_answer NOT NULL`，当数据库已经存在人工题或人工题
快照时，降级回旧 Schema 无法无损完成。对应 Migration 必须明确拒绝这种降级，
由运维先显式迁移或清理人工题数据；禁止伪造 `correct_answer`。

---

# 12. question_options 题目选项表

## 12.1 作用

仅用于单选、多选题的选项。

判断、填空、主观问答题均不创建 `question_options`。

## 12.2 字段

| 字段             | 类型          | 约束                 | 说明    |
| -------------- | ----------- | ------------------ | ----- |
| id             | BIGINT      | PK, AUTO_INCREMENT | 主键    |
| question_id    | BIGINT      | NOT NULL, FK       | 题目 ID |
| option_key     | VARCHAR(10) | NOT NULL           | 选项编码  |
| option_content | TEXT        | NOT NULL           | 选项内容  |
| sort_order     | INT         | NOT NULL           | 排序    |
| created_at     | DATETIME    | NOT NULL           | 创建时间  |
| updated_at     | DATETIME    | NOT NULL           | 更新时间  |

约束：

```text
UNIQUE(question_id, option_key)
```

外键：

```text
question_options.question_id → questions.id
```

---

# 13. 题目校验规则

## 13.1 单选题

必须：

* 至少 2 个选项
* correct_answer 只有 1 个值
* 正确答案对应真实 option_key

## 13.2 多选题

必须：

* 至少 2 个选项
* correct_answer 至少 2 个值
* 答案不能重复
* 所有答案必须对应真实 option_key

## 13.3 判断题

必须：

* 不创建 question_options
* correct_answer 只能是 `["true"]` 或 `["false"]`

## 13.4 填空题

必须：

* 不创建 question_options
* `correct_answer = NULL`
* `reference_answer` 可为空
* 学生未来提交一段文本，由教师整体人工评分

V1 不设计多空、每空评分、多答案、同义词或自动匹配。

## 13.5 主观问答题

必须：

* 不创建 question_options
* `correct_answer = NULL`
* `reference_answer` 可为空
* 教师在题目满分范围内人工给分，允许部分分

## 13.6 评分分类

业务代码使用一处集中定义：

```text
AUTO_GRADED_QUESTION_TYPES =
  single_choice, multiple_choice, true_false

MANUAL_GRADED_QUESTION_TYPES =
  fill_blank, subjective
```

不得在各模块重复维护题型分类。

---

# 14. papers 试卷表

## 14.1 作用

保存试卷基础信息。

## 14.2 字段

| 字段          | 类型           | 约束                 | 说明   |
| ----------- | ------------ | ------------------ | ---- |
| id          | BIGINT       | PK, AUTO_INCREMENT | 主键   |
| name        | VARCHAR(200) | NOT NULL           | 试卷名称 |
| description | TEXT         | NULL               | 描述   |
| total_score | DECIMAL(6,2) | NOT NULL           | 总分   |
| status      | VARCHAR(20)  | NOT NULL           | 状态   |
| created_by  | BIGINT       | NOT NULL, FK       | 创建人  |
| created_at  | DATETIME     | NOT NULL           | 创建时间 |
| updated_at  | DATETIME     | NOT NULL           | 更新时间 |

状态：

```text
draft
active
disabled
```

外键：

```text
papers.created_by → users.id
```

---

# 15. paper_questions 试卷题目关系表

## 15.1 作用

建立试卷与题目的关系，并保存：

* 当前试卷中的分值
* 当前试卷中的题目顺序

## 15.2 字段

| 字段          | 类型           | 约束                 | 说明    |
| ----------- | ------------ | ------------------ | ----- |
| id          | BIGINT       | PK, AUTO_INCREMENT | 主键    |
| paper_id    | BIGINT       | NOT NULL, FK       | 试卷 ID |
| question_id | BIGINT       | NOT NULL, FK       | 题目 ID |
| score       | DECIMAL(6,2) | NOT NULL           | 分值    |
| sort_order  | INT          | NOT NULL           | 顺序    |
| created_at  | DATETIME     | NOT NULL           | 创建时间  |
| updated_at  | DATETIME     | NOT NULL           | 更新时间  |

约束：

```text
UNIQUE(paper_id, question_id)
UNIQUE(paper_id, sort_order)
```

外键：

```text
paper_questions.paper_id → papers.id
paper_questions.question_id → questions.id
```

`score` 必须大于 0。

试卷总分：

```text
SUM(paper_questions.score)
```

后端负责重新计算 `papers.total_score`。

五种题型都可以加入试卷。`paper_questions` 不冗余保存阅卷方式，评分方式由
关联题目的 `question_type` 确定。包含客观题与人工题的混合试卷可以正常启用，
启用规则仍为至少一题且总分大于 0。

---

# 16. exams 考试表

## 16.1 作用

保存一场正式考试的基础信息。

Exam 表示“一场考试”，不是学生的一次答题。

例如：

```text
2026 云计算 Linux 期末考试
```

## 16.2 字段

| 字段               | 类型           | 约束                 | 说明      |
| ---------------- | ------------ | ------------------ | ------- |
| id               | BIGINT       | PK, AUTO_INCREMENT | 主键      |
| name             | VARCHAR(200) | NOT NULL           | 考试名称    |
| paper_id         | BIGINT       | NOT NULL, FK       | 原始试卷    |
| description      | TEXT         | NULL               | 考试说明    |
| start_time       | DATETIME     | NOT NULL           | 开始时间    |
| end_time         | DATETIME     | NOT NULL           | 统一结束时间  |
| duration_minutes | INT          | NOT NULL           | 考试时长，分钟 |
| pass_score       | DECIMAL(6,2) | NOT NULL           | 及格分     |
| total_score      | DECIMAL(6,2) | NOT NULL           | 发布时总分   |
| status           | VARCHAR(20)  | NOT NULL           | 状态      |
| published_at     | DATETIME     | NULL               | 发布时间    |
| created_by       | BIGINT       | NOT NULL, FK       | 创建教师    |
| created_at       | DATETIME     | NOT NULL           | 创建时间    |
| updated_at       | DATETIME     | NOT NULL           | 更新时间    |

状态：

```text
draft
published
finished
```

“进行中”不建议必须持久化，可根据当前时间动态判断：

```text
published + start_time <= now < end_time
```

外键：

```text
exams.paper_id → papers.id
exams.created_by → users.id
```

---

# 17. exams 业务规则

必须满足：

```text
start_time < end_time
duration_minutes > 0
pass_score >= 0
pass_score <= total_score
```

考试发布后：

* 不允许随意更换试卷
* 不允许修改快照题目
* 原始试卷后续变化不得影响考试

---

# 18. exam_targets 考试对象表

## 18.1 作用

保存考试面向哪些学生。

V1 支持：

* 全部学生
* 指定专业
* 指定班级

采用统一目标表设计。

## 18.2 字段

| 字段          | 类型          | 约束                 | 说明    |
| ----------- | ----------- | ------------------ | ----- |
| id          | BIGINT      | PK, AUTO_INCREMENT | 主键    |
| exam_id     | BIGINT      | NOT NULL, FK       | 考试 ID |
| target_type | VARCHAR(20) | NOT NULL           | 对象类型  |
| target_id   | BIGINT      | NULL               | 对象 ID |
| created_at  | DATETIME    | NOT NULL           | 创建时间  |

target_type：

```text
all
major
class
```

规则：

### 全部学生

```text
target_type = all
target_id = NULL
```

### 指定专业

```text
target_type = major
target_id = majors.id
```

### 指定班级

```text
target_type = class
target_id = classes.id
```

---

# 19. exam_targets 约束

同一考试避免重复目标：

```text
UNIQUE(exam_id, target_type, target_id)
```

注意：

MySQL 对 NULL 唯一约束处理较特殊。

因此业务层必须额外保证：

一个考试最多只能存在一条：

```text
target_type = all
```

V1 建议规则：

如果考试对象是 `all`，则不能同时再配置 major 或 class。

---

# 20. exam_questions 考试题目快照表

## 20.1 作用

考试发布时，将试卷题目完整复制为考试快照。

这是历史考试稳定性的核心。

发布后，学生答题必须读取：

```text
exam_questions
```

不能实时读取原始：

```text
questions
paper_questions
```

---

## 20.2 字段

| 字段                   | 类型           | 约束                 | 说明      |
| -------------------- | ------------ | ------------------ | ------- |
| id                   | BIGINT       | PK, AUTO_INCREMENT | 快照题主键   |
| exam_id              | BIGINT       | NOT NULL, FK       | 考试 ID   |
| original_question_id | BIGINT       | NULL               | 原始题目 ID |
| question_type        | VARCHAR(20)  | NOT NULL           | 题型快照    |
| content              | TEXT         | NOT NULL           | 题干快照    |
| options              | JSON         | NULL               | 选项快照    |
| correct_answer       | JSON         | NULL               | 自动阅卷标准答案快照 |
| reference_answer     | TEXT         | NULL               | 人工阅卷参考答案快照 |
| analysis             | TEXT         | NULL               | 解析快照    |
| score                | DECIMAL(6,2) | NOT NULL           | 分值快照    |
| sort_order           | INT          | NOT NULL           | 顺序快照    |
| created_at           | DATETIME     | NOT NULL           | 创建时间    |

外键：

```text
exam_questions.exam_id → exams.id
```

`original_question_id` 只用于追溯来源，不作为历史考试内容依赖。

---

# 21. exam_questions options 结构

单选/多选：

```json
[
  {
    "key": "A",
    "content": "Linux",
    "sort_order": 1
  },
  {
    "key": "B",
    "content": "Windows",
    "sort_order": 2
  }
]
```

判断、填空、主观问答题均为：

```json
null
```

前端固定展示：

```text
正确
错误
```

自动阅卷题快照：

* 复制 `correct_answer`
* `reference_answer = NULL`

人工阅卷题快照：

* `options = NULL`
* `correct_answer = NULL`
* 复制 `reference_answer`

`reference_answer` 与题干、答案、分值和顺序一样属于不可变考试快照。发布后
修改原题参考答案不得影响已经发布的考试。

---

# 22. 考试发布流程

```text
教师创建 Exam
↓
状态 draft
↓
选择试卷
↓
配置考试对象
↓
点击发布
↓
校验试卷有效
↓
读取 paper_questions
↓
读取 questions + question_options
↓
生成 exam_questions 快照
↓
复制 total_score
↓
记录 published_at
↓
Exam 状态改为 published
```

发布过程必须使用数据库事务。

任何一步失败，应整体回滚。

---

# 23. exam_attempts 学生考试记录表

## 23.1 作用

表示某个学生参加某场考试的一次完整作答。

关系：

```text
Exam
  ↓
ExamAttempt
  ↓
ExamAnswer
```

## 23.2 字段

| 字段              | 类型           | 约束                 | 说明       |
| --------------- | ------------ | ------------------ | -------- |
| id              | BIGINT       | PK, AUTO_INCREMENT | 主键       |
| exam_id         | BIGINT       | NOT NULL, FK       | 考试 ID    |
| student_user_id | BIGINT       | NOT NULL, FK       | 学生用户 ID  |
| status          | VARCHAR(20)  | NOT NULL           | 作答状态     |
| grading_status  | VARCHAR(30)  | NOT NULL           | 阅卷状态     |
| started_at      | DATETIME     | NOT NULL           | 开始时间     |
| deadline_at     | DATETIME     | NOT NULL           | 本次实际截止时间 |
| submitted_at    | DATETIME     | NULL               | 提交时间     |
| score           | DECIMAL(6,2) | NULL               | 最终得分     |
| is_passed       | BOOLEAN      | NULL               | 是否及格     |
| created_at      | DATETIME     | NOT NULL           | 创建时间     |
| updated_at      | DATETIME     | NOT NULL           | 更新时间     |

状态：

```text
in_progress
submitted
```

作答状态与阅卷状态分离，避免把答题生命周期和评分生命周期混在一个字段中。
未来 `grading_status` 至少考虑：

```text
not_started
pending_manual_grading
graded
```

纯客观题提交并自动评分完成后可直接进入 `graded`。包含人工题时，提交后进入
`pending_manual_grading`；全部人工题阅卷完成后才进入 `graded`。

V1 每个学生每场考试只允许一次：

```text
UNIQUE(exam_id, student_user_id)
```

外键：

```text
exam_attempts.exam_id → exams.id
exam_attempts.student_user_id → users.id
```

---

# 24. deadline_at 计算

学生开始考试时：

```text
理论结束时间 = started_at + duration_minutes
```

实际截止时间：

```text
deadline_at =
min(
  started_at + duration_minutes,
  exams.end_time
)
```

这个结果必须保存到：

```text
exam_attempts.deadline_at
```

不能以后每次动态重新计算，避免考试配置变更影响已开始考试。

---

# 25. 开始考试规则

学生点击开始考试时，后端必须校验：

* 当前用户是 student
* 用户状态 active
* 学生有 student_profile
* 当前考试已发布
* 当前时间已到 start_time
* 当前时间早于 end_time
* 学生属于考试目标范围
* 不存在已有 exam_attempt

通过后：

```text
创建 exam_attempt
status = in_progress
```

---

# 26. exam_answers 学生答案表

## 26.1 作用

保存学生每道题的答案和评分结果。

## 26.2 字段

| 字段               | 类型           | 约束                 | 说明             |
| ---------------- | ------------ | ------------------ | -------------- |
| id               | BIGINT       | PK, AUTO_INCREMENT | 主键             |
| attempt_id       | BIGINT       | NOT NULL, FK       | ExamAttempt ID |
| exam_question_id | BIGINT       | NOT NULL, FK       | 考试快照题 ID       |
| answer           | JSON         | NULL               | 学生答案           |
| is_correct       | BOOLEAN      | NULL               | 是否正确           |
| score_awarded    | DECIMAL(6,2) | NULL               | 获得分数           |
| grading_status   | VARCHAR(20)  | NOT NULL           | 单题阅卷状态         |
| grader_id        | BIGINT       | NULL, FK           | 人工阅卷教师 ID      |
| grading_comment  | TEXT         | NULL               | 阅卷评语             |
| graded_at        | DATETIME     | NULL               | 阅卷完成时间          |
| answered_at      | DATETIME     | NULL               | 最后答题时间         |
| created_at       | DATETIME     | NOT NULL           | 创建时间           |
| updated_at       | DATETIME     | NOT NULL           | 更新时间           |

约束：

```text
UNIQUE(attempt_id, exam_question_id)
```

外键：

```text
exam_answers.attempt_id → exam_attempts.id
exam_answers.exam_question_id → exam_questions.id
exam_answers.grader_id → users.id
```

自动阅卷题：

```text
grading_status = graded
is_correct = 系统判定结果
score_awarded = 系统计算分值
grader_id = NULL
```

人工阅卷题提交时：

```text
grading_status = pending
is_correct = NULL
score_awarded = NULL
```

教师阅卷完成后：

```text
grading_status = graded
score_awarded = 教师给分
grader_id = 阅卷教师
graded_at = 阅卷时间
```

人工题允许部分得分；`is_correct` 主要服务于客观题，对人工题可以保持 NULL。
以上字段属于后续作答/阅卷模块设计，本轮不创建相关表或 Migration。

---

# 27. 学生答案格式

答案格式按题型区分。

单选：

```json
["A"]
```

多选：

```json
["A", "C"]
```

判断：

```json
["true"]
```

填空和主观问答：

```json
"学生提交的一段文本"
```

未作答可以：

```text
NULL
```

---

# 28. 答案保存规则

学生在考试过程中保存答案时：

后端必须校验：

* ExamAttempt 属于当前用户
* 状态必须是 in_progress
* 当前时间不能超过 deadline_at
* exam_question_id 必须属于当前考试
* 答案格式必须符合题型

保存采用：

```text
upsert
```

语义：

如果该题首次答题：

```text
INSERT
```

如果已经答过：

```text
UPDATE
```

提交前：

```text
is_correct
score_awarded
```

可以保持 NULL。

学生考试进行中的题目响应不得返回：

```text
correct_answer
reference_answer
analysis
```

`reference_answer` 与 `correct_answer` 同属敏感阅卷信息。学生作答接口必须使用
独立响应 Schema，禁止复用题库管理或考试快照管理 Schema。

---

# 29. 自动评分与人工评分规则

提交考试时统一评分。

## 单选题

```text
student_answer == correct_answer
```

正确：

```text
score_awarded = exam_question.score
```

错误：

```text
score_awarded = 0
```

## 多选题

按集合比较：

```text
set(student_answer) == set(correct_answer)
```

完全一致才得分。

## 判断题

答案一致即得分。

## 填空题

永远人工评分，不执行文本、大小写、同义词或模糊匹配。

## 主观问答题

永远人工评分，教师可以在该题满分范围内给部分分。

---

# 30. 提交考试流程

```text
学生点击提交
↓
后端锁定 ExamAttempt
↓
校验属于当前用户
↓
校验状态 in_progress
↓
获取全部 exam_questions
↓
获取全部 exam_answers
↓
自动评分客观题
↓
更新 is_correct
↓
更新 score_awarded
↓
如有人工题则 grading_status = pending_manual_grading
↓
status = submitted
↓
submitted_at = 当前时间
↓
提交事务
```

整个流程必须使用数据库事务。

纯客观题在提交事务中即可汇总最终分数并计算 `is_passed`。包含人工题时，
自动评分阶段只能得到客观题小计，`exam_attempts.score` 和 `is_passed` 不得
作为最终结果；全部人工题完成后再执行：

```text
客观题得分 + 人工题得分 = 最终成绩
```

然后写入最终 `score`、`is_passed`，并将 `grading_status` 改为 `graded`。

---

# 31. 防重复提交

提交接口必须保证幂等。

如果 ExamAttempt 已经：

```text
status = submitted
```

再次提交时：

* 不重新评分
* 不重复创建成绩
* 返回已有最终结果

---

# 32. 超时处理

后端不能只依赖前端倒计时。

任何：

* 保存答案
* 提交考试

请求都必须校验：

```text
now <= deadline_at
```

如果已超时：

V1 可以采用以下策略：

```text
禁止继续保存答案
触发一次自动提交逻辑
```

即使前端断网或关闭页面，后端仍以 deadline_at 为最终标准。

---

# 33. 成绩来源

V1 不单独创建 results 表。

最终成绩直接保存在：

```text
exam_attempts.score
exam_attempts.is_passed
```

每题得分保存在：

```text
exam_answers.score_awarded
```

原因：

V1 每个学生每场考试只有一次 ExamAttempt。

额外 results 表会造成重复数据。

以后支持：

* 多次考试
* 最佳成绩
* 人工复核
* 成绩发布状态

时再评估是否增加独立成绩汇总表。

---

# 34. 考试总体关系

```text
Paper
  ↓
Exam
  ├── ExamTarget
  ├── ExamQuestion
  └── ExamAttempt
        └── ExamAnswer
```

完整关系：

```text
questions
   ↓
paper_questions
   ↓
papers
   ↓
exams
   ├── exam_targets
   ├── exam_questions
   └── exam_attempts
         └── exam_answers
```

---

# 35. 核心唯一约束总结

```text
users.username UNIQUE

roles.code UNIQUE

user_roles
UNIQUE(user_id, role_id)

majors.name UNIQUE
majors.code UNIQUE

classes.code UNIQUE

student_profiles.user_id UNIQUE
student_profiles.student_no UNIQUE

question_options
UNIQUE(question_id, option_key)

paper_questions
UNIQUE(paper_id, question_id)
UNIQUE(paper_id, sort_order)

exam_questions
UNIQUE(exam_id, sort_order)

exam_attempts
UNIQUE(exam_id, student_user_id)

exam_answers
UNIQUE(attempt_id, exam_question_id)
```

---

# 36. 建议索引

## users

```text
INDEX(status)
```

## user_roles

```text
INDEX(user_id)
INDEX(role_id)
```

## classes

```text
INDEX(major_id)
INDEX(status)
```

## student_profiles

```text
INDEX(class_id)
```

## questions

```text
INDEX(question_type)
INDEX(difficulty)
INDEX(status)
INDEX(created_by)
```

## question_options

```text
INDEX(question_id)
```

## papers

```text
INDEX(status)
INDEX(created_by)
```

## paper_questions

```text
INDEX(paper_id)
INDEX(question_id)
```

## exams

```text
INDEX(status)
INDEX(start_time)
INDEX(end_time)
INDEX(created_by)
```

## exam_targets

```text
INDEX(exam_id)
INDEX(target_type, target_id)
```

## exam_questions

```text
INDEX(exam_id)
```

## exam_attempts

```text
INDEX(exam_id)
INDEX(student_user_id)
INDEX(status)
```

## exam_answers

```text
INDEX(attempt_id)
INDEX(exam_question_id)
```

---

# 37. 删除与历史数据原则

## 用户

产生历史考试数据后：

```text
禁止物理删除
使用 disabled
```

## 专业

存在班级时：

```text
禁止直接删除
使用 disabled
```

## 班级

存在学生或历史业务数据时：

```text
禁止直接删除
使用 disabled
```

## 题目

已经被试卷使用时：

优先：

```text
disabled
```

## 试卷

已经被考试使用时：

禁止物理删除。

## 考试

考试发布后：

原则上不物理删除。

历史考试必须保留：

* 快照
* 作答
* 成绩

---

# 38. 时间字段原则

统一使用：

```text
DATETIME
```

应用层建议统一处理时区。

数据库建议保存统一时间标准，例如 UTC。

前端根据用户所在时区展示。

V1 开发过程中必须保持时间处理方式统一，不允许部分使用本地时间、部分使用 UTC。

---

# 39. 金额/分数字段原则

考试分数使用：

```text
DECIMAL(6,2)
```

不要使用：

```text
FLOAT
DOUBLE
```

避免浮点精度问题。

适用字段：

```text
papers.total_score
paper_questions.score
exams.pass_score
exams.total_score
exam_questions.score
exam_attempts.score
exam_answers.score_awarded
```

---

# 40. V1 暂不设计的表

暂不增加：

* permissions
* role_permissions
* student_class_history
* grades
* departments
* campuses
* schools
* tenants
* question_categories
* knowledge_points
* question_tags
* wrong_questions
* manual_grading_tasks
* notifications
* audit_logs
* anti_cheat_logs
* ai_tasks
* redis_cache_tables

V1 优先保证核心考试闭环。

---

# 41. 最终核心实体关系

```text
Major
  ↓
Class
  ↓
StudentProfile
  ↓
User
  ↑
UserRole
  ↓
Role


User(Teacher)
  ↓
Question
  ├── QuestionOption
  └── PaperQuestion
         ↓
       Paper
         ↓
       Exam
       ├── ExamTarget
       ├── ExamQuestion
       └── ExamAttempt
              ↓
           ExamAnswer
```

---

# 42. V1 数据模型核心原则

1. 用户基础信息与学生专属信息分离。

2. 学生只保存 class_id，专业通过班级推导。

3. 专业、班级都是数据库实体，不写死在代码中。

4. 题目负责内容，试卷负责组织。

5. 题目分值属于 paper_questions，不属于 questions。

6. 正式考试发布后必须生成 exam_questions 快照。

7. 历史考试不能依赖后续可能发生变化的原始题库和试卷数据。

8. Exam 表示考试，ExamAttempt 表示学生的一次作答。

9. V1 每个学生每场考试只允许一次 ExamAttempt。

10. 客观题答案和正确答案使用 JSON 数组；填空、主观题答案是一段文本。

11. 单选、多选、判断题由后端自动评分；填空、主观问答题永远人工评分。

12. 自动评分题必须保存 `correct_answer`，人工评分题必须为 NULL；人工题可保存
    可选的 `reference_answer`。

13. 作答状态与阅卷状态分离；人工题未全部阅完前不得生成最终及格结论。

14. 最终成绩直接保存在 exam_attempts，不额外创建冗余 results 表。

15. 核心提交、发布、评分流程必须使用数据库事务。

16. 权限和考试范围判断必须以后端为准。

17. 已产生历史业务数据的核心实体优先禁用，不物理删除。
