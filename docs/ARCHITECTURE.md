# Onda 技术架构

## 当前运行路径

本机执行 `python3 server.py`，访问 `http://127.0.0.1:8736/`。Python 标准库服务提供 public 下的静态资源。首页由 library.js 加载素材与复习卡；workspace.html 和 app.js 负责选课、音轨切换、原文与提问，listening.js 控制原站 SoundCloud Widget。入口参数 audio 支持课程的任一音轨 ID。多音轨课程的每条录音都有独立的草稿和标记。

课程数据在 lessons.json，目录在 catalog.json。当前原站材料可能包含题干、独立答案链接或题图，文本行不等于已对齐的字幕。浏览器键 onda-track-{track} 存区间毫秒值、收藏、听写、大意和自评归因；onda-review-v1 存旧版文字短语调度。刷新、切课、直接访问深链接均应可恢复。大意草稿可编辑，不计入不可变的初测记录。

training.js 保存每轨的初答、信心、揭示条件、局部听写与反思（onda-training-v1-{track}）。practice.js 按用户的本地日历日和时间预算安排练习；onda-audio-review-{track}-{a}-{b} 保存待核对初答、用户确认的参考文本、识别与自评历史。复习调用播放器回放指定区间一次。工作台的本地 HTML Audio 适配器支持同版本录音的变速，原站使用 Widget 能力。手选参考句不产生自动时间戳。

当前 POST /ask 接收 lesson、line 数组索引和 question，服务端从本地课文构造上下文，在回环地址校验 Origin 和 Host 后调用本机已登录的 Codex，返回文本或失败状态。账号凭据由本机客户端管理。该实现仅服务本机使用。

## 目标技术栈与边界

多人版本建议 Next.js、React、TypeScript、Tailwind CSS，按需采用 shadcn/ui。由 Next.js API Routes 承担应用服务，离线转写或分析任务可分离至 Python 服务。PostgreSQL 存学习记录；对象存储仅放有相应授权的音频。外链材料保留允许的官方播放器。Redis 在引入后台队列或有明确缓存需求时使用。逐步迁移现有入口，保留旧数据导入路径。

## 数据库设计（目标）

| 实体 | 关键列与约束 |
|---|---|
| learner / preferences | user_id，语言、CEFR、目标、主题、每日分钟数、时区 |
| recording | audio_id，language，cefr_level，duration_ms，topic，speaker_id，accent_or_region，provider，audio_url，source_url，content_license，dataset_split，text_group_id，审核状态 |
| transcript / sentence | 转写版本、文本、audio_id、句序、起止毫秒、对齐来源与审核状态；未知时间允许空值 |
| question / phonetic_target | audio_id、任务类型、题干、选项、答案、依据句、目标音类、审核版本 |
| session / attempt | user_id、session_id、audio_id、task_type、first_attempt、final_attempt、correctness、confidence、error_tags、replay_count、subtitle_usage、playback_speed、response_time、created_at |
| clip / review_event | 用户、录音、起止毫秒、关联参考句、草稿、错误标签、到期时间、上次提取时间、实测结果与自评 |
| daily_plan / item | 用户本地日期、预算、任务、分配时长、推荐依据、规则版本和状态 |

dataset_split 使用 training、practice、assessment。发布题库前按音频、文本近重复和测试目的检查分组；跨说话者测试留出说话者。曾向用户曝光的材料记录曝光时间。训练数据缺少说话者或授权信息时标记未知。评估集排除这些不满足测试条件的样本。

## API 契约（规划，当前仅 /ask 已实现）

| 路径 | 请求与结果 |
|---|---|
| GET /api/recordings；GET /api/recordings/{id} | 分页与语言、级别、主题、时长筛选；返回来源、音轨、播放器能力。正式测试作答前不下发答案和参考文本。 |
| PUT /api/me/preferences；GET /api/plans/today | 保存设置；返回预算内的任务、分钟数、规则依据。 |
| POST /api/sessions；POST /api/sessions/{id}/attempts | 创建训练或评测；提交答案、信心和辅助条件。客户端事件 ID 去重，初答仅写一次，修正追加。 |
| POST /api/clips；GET /api/reviews/due；POST /api/reviews/{id}/attempts | 校验片段边界和所有权；按时区取到期卡；同一事务记录提取结果并更新到期日。 |
| GET /api/analytics | 按时间范围、材料熟悉度、说话者、字幕与速度聚合，附样本数和数据不足状态。 |

多人 API 使用服务端会话，将用户身份绑定到资源；校验范围、枚举和素材可见性。版本冲突应返回可恢复状态。迁移浏览器记录时用稳定音频 ID 和导入标识去重，不把历史草稿推断为首次正确作答。

## 播放器设计

面向播放源封装 play、pause、seek(ms)、position、duration、ready、error 和能力描述。所有时间边界内部使用毫秒。当前 SoundCloud 通道实现播放、定位、5 秒回退、A–B 循环和遍间停顿。对可直接播放的授权音频使用 HTMLAudioElement；目标语言字幕采用核对过的时间区间，原生播放支持 playbackRate（0.75/1/1.25 等）。提供方没有变速能力时解释限制。需要声音分析时再使用 Web Audio。

状态依次覆盖加载、可播放、播放、暂停、循环等待、结束与异常。切换录音清除循环定时器、解除旧事件，异步回调核对音轨代次；到 B 或自然结束只消费一次循环。校验 0 ≤ A < B ≤ 时长。快捷键目标为空格播放暂停、左右键定位、A/B 标点，文本输入期间不拦截。移动端经用户手势启动。字幕揭示与播放速度变化独立记事件。进入盲听重放关闭字幕并回到段首；整段重听回到录音起点。

## 反馈和分析管线

可评分的听写先归一大小写、空白和可接受的标点变体，再按词序列对齐，分别标出遗漏、替换、插入，保留原始输入。人工核对转写和答案后才启用自动评分。AI 解释、建议标签与用户确认标签分开记录；未审核 ASR、对齐或生成题进入待审队列。参与测评的正确率按可判分任务计算，缺失数据保留为空。按是否首次曝光、字幕、说话者、间隔与语速分层；校准比较信心分组的平均信心与实测正确率。每次推荐返回依据和缺失数据说明，早期使用可解释规则。
