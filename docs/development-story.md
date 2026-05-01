# 用 Claude Code 从零打造一款仙侠空战游戏

## 项目概览

**仙侠空战**（Xiuxian Air Combat）是一款基于浏览器的 3D 空战游戏，玩家御剑飞行，使用4个技能斩妖除魔。整个项目**零美术资源**——所有模型是程序化几何体，所有音效是 Web Audio 合成，纯代码驱动。

- 🔗 在线试玩：https://nathanchlin.github.io/Xiuxian/
- 📦 源码：https://github.com/nathanchlin/Xiuxian
- 🛠 技术栈：Three.js + TypeScript + Vite
- 📊 代码量：19 个 TypeScript 文件，约 4000 行
- 📝 Git 提交：16 次迭代

---

## 开发过程

### 第一阶段：基础飞行体验调试

拿到初始代码库后，第一步不是加功能，而是**屏蔽干扰因素，专注核心手感**：

1. **屏蔽怪物和通关判断**——在 `spawnEnemies()`、`spawnBoss()` 开头加 `return;`，注释掉波次推进逻辑，获得一个纯净的飞行沙盒
2. **调整按键映射**——冲刺键从 Tab 改为 Shift（更符合直觉），下降键相应从 Shift 改为 Ctrl
3. **增强加速反馈**——加速时飞剑拖尾根据速度动态变长（2→8），让玩家"感受到"速度变化
4. **修复镜头跳变**——按住前进切换视角时镜头会跳。根因：过渡动画的起点用的是"理想位置"而非相机实际位置。修复为切换瞬间快照真实相机状态，从实际位置平滑插值

> 💡 **经验**：拿到一个新项目，先屏蔽复杂系统，把核心体验（这里是飞行手感）调到满意，再逐步加回功能。

### 第二阶段：技能系统设计（Brain Storming）

用 Claude Code 的 brainstorming skill 进行结构化设计对话：

**4 轮提问确定方向：**
- 战斗风格？→ **剑法双修（远近混合）**
- 技能联动机制？→ **资源循环流**（A 产生资源，B 消耗资源爆发）
- 资源类型？→ **灵力 + 剑意叠层**（双资源系统）
- 终结技感觉？→ **一剑穿透型**

**3 个备选方案对比后选定方案 A：**

| 技能 | 按键 | 定位 | 剑意获取 |
|------|------|------|----------|
| 灵刃散射 | 1 | 远程扇形 AOE | 每命中 +1 |
| 御剑突刺 | 2 | 近战突进+无敌帧 | 每命中 +2 |
| 剑气护体 | 3 | 主动格挡+反弹 | 成功 +3 |
| 万剑归宗 | 左键(满层) | 穿透终结技 | 消耗5层 |

核心循环：`远程积累剑意 → 突进收割 → 格挡反击 → 满层终结 → 循环`

设计文档自动保存到 `docs/superpowers/specs/` 并 git commit。

> 💡 **经验**：让 AI 提供多选项比直接让它决定好得多。每轮只问一个问题，逐步收敛。

### 第三阶段：实现计划制定

设计确认后，自动生成 8 个 Task 的详细实现计划，每个 Task 包含：
- 具体要改哪些文件的哪些行
- 完整的代码片段
- 验证命令和预期输出
- git commit 信息

计划保存到 `docs/superpowers/plans/` 并 commit。

### 第四阶段：并行子代理开发

这是最有意思的部分——用 **Subagent-Driven Development** 模式执行计划：

```
Task 1 (config.ts)        ─┐
Task 2 (FlightController)  ├── 并行执行 (3个子代理)
Task 4 (Sfx)              ─┘
         ↓ 全部完成
Task 3 (SkillSystem)  ─┐
Task 5 (Hud)           ├── 并行执行 (2个子代理)
                       ─┘
         ↓ 全部完成
Task 6 (Game.ts 集成)      ── 串行（依赖前面所有）
         ↓
Task 7+8 (恢复怪物 + 部署)  ── 串行
```

**模型选择策略：**
- 简单机械任务（config 添加、Sfx 添加方法）→ **Haiku**（便宜快速）
- 需要判断力的任务（FlightController 键位冲突、SkillSystem 完整逻辑）→ **Sonnet**
- 集成任务（Game.ts 串联所有模块）→ **Sonnet**

8 个 Task 总共耗时约 10 分钟完成，其中并行阶段大幅缩短了等待时间。

> 💡 **经验**：独立的 Task 并行 dispatch，依赖的 Task 串行执行。给子代理的 prompt 要包含完整上下文——它们没有你的会话历史。

### 第五阶段：Bug 修复与平衡迭代

上线后进入快速迭代阶段，连续修了一系列问题：

| 问题 | 根因 | 修复 |
|------|------|------|
| 左键射线方向反了 | CylinderGeometry 的 translate 偏移 + lookAt 交互导致反向 | 改用中点定位 + lookAt + rotateX |
| 死亡后鼠标没光标 | entry.ts 的 pointerlockchange 覆盖了 game-over 界面 | Game 暴露 state getter，entry.ts 检查状态后决定是否显示 overlay |
| 重新修炼后 pointer lock 丢失 | hideEndScreens() 先移除按钮 DOM，requestPointerLock() 失去用户交互上下文 | 在 click handler 中先 requestPointerLock 再 restart |
| 敌人伤害太高 | 灵鸦 10 伤害 vs 玩家 100 血，10 下就死 | 分两轮砍到 3（灵鸦）/6（岩蟒）/9（蛟龙） |
| 怪物扎堆 | 生成角度完全随机 | 改为均匀分布 360°/数量 + 小随机偏移 |
| 左下角 UI 重叠 | 旧武器面板和新技能 CD 指示器都在 bottom:90px left:18px | 隐藏旧面板，调整新面板位置 |

> 💡 **经验**：每次只改一个问题，改完让用户确认，再改下一个。不要一次性"猜测"多个修复。

---

## 技术亮点

### 零资源架构
- **几何体**：Box、Sphere、Cylinder、Plane 等 Three.js 基础几何体组合
- **音效**：Web Audio API 的 OscillatorNode + BiquadFilter + 白噪声合成
- **UI**：纯 DOM 内联样式，无 CSS 文件（除了 body 基础样式），雷达用 Canvas 2D 绘制

### 四元数飞行控制
- 无万向锁的 6DOF 飞行，鼠标直驱偏航/俯仰，Q/E 角速度翻滚
- Spring-damper 第三人称相机跟随，带平滑过渡到第一人称

### 资源循环战斗系统
- 双资源：灵力（持续回复）+ 剑意（命中叠层，10秒衰减）
- 4 技能形成"蓄力→爆发"循环，终结技需要满5层剑意解锁
- Parry 系统：0.8秒主动格挡窗口，成功反弹 50 伤害 + 快速叠3层剑意

---

## 项目结构

```
src/
├── config.ts              # 全局配置（物理、技能数值、关卡、渲染）
├── Game.ts                # 游戏主循环编排器
├── entry.ts               # 浏览器入口
├── core/CameraSystem.ts   # 双模式相机（三人称弹簧+一人称）
├── player/
│   ├── FlightController.ts # 6DOF 飞行物理 + 资源管理
│   ├── SkillSystem.ts      # 4技能逻辑 + 投射物 + 视觉效果
│   └── PlayerModel.ts      # 三人称角色模型 + 拖尾
├── enemy/
│   ├── Enemy.ts            # AI 状态机（巡逻/追击/攻击/逃跑）
│   └── Boss.ts             # 三阶段 Boss
├── world/
│   ├── Arena.ts            # 程序化竞技场（建筑/桥/浮岛/天空盒）
│   └── Pickup.ts           # 拾取物
├── shared/
│   ├── Engine.ts           # Three.js 渲染循环
│   ├── Input.ts            # 键鼠 + 触屏输入
│   ├── Sfx.ts              # Web Audio 合成音效
│   └── collision.ts        # AABB/球体碰撞数学
└── ui/Hud.ts               # DOM 飞行仪表盘 + 雷达
```

---

## 关键 Takeaway

1. **先调手感，再加系统**——屏蔽复杂逻辑，在纯净环境里打磨核心体验
2. **结构化设计对话**——每轮一个问题，多选项对比，逐步收敛设计
3. **并行子代理加速**——独立任务并行 dispatch，按依赖关系编排执行顺序
4. **按模型能力分配任务**——简单任务用便宜模型，复杂集成用强模型
5. **小步迭代修 bug**——一次一个问题，用户确认后再下一个
6. **CONFIG 驱动调参**——所有数值集中在一个文件，改参数不需要改逻辑代码
