# 小学数学 · 简约网页版

人教版小学数学 **一至六年级（上下册，共 12 册）** 的纯网页精简版：只在浏览器里跑，
没有桌面端、安卓端，也没有双币、宝石、心、排行榜等游戏化模块。

- 12 册教材 / 482 节课（含 106 节单元测验）/ 4,028 道题
- 页面只有三层：年级书目 → 单元课时 → 做题与解析
- 样式：留白 + 细线 + 单一墨绿色强调色，无阴影、无插图、无动画特效（进度条除外）
- 数据离线可用：KaTeX 与教材数据都在本地目录，断网也能打开

## 运行

```bash
cd apps/primary-math
node serve.mjs          # 默认 http://localhost:5180
```

或用自带脚本：

```bash
npm run dev             # 先重建数据再启动
npm run data            # 只重建数据（从主工程抽取）
```

`serve.mjs` 是零依赖静态服务器，只要求 Node 18+。

## 目录

```
apps/primary-math/
├─ build-data.mjs      # 抽取「小学数学」数据 + 修复公式
├─ verify-data.mjs     # 数据与公式自检（KaTeX 全量解析）
├─ serve.mjs           # 零依赖静态服务器
└─ public/
   ├─ index.html
   ├─ assets/app.js    # 原生 JS：hash 路由 + 做题逻辑
   ├─ assets/style.css
   ├─ katex/           # KaTeX 离线资源
   └─ data/
      ├─ index.json              # 书目索引（年级 / 册 / 单元数 / 题量）
      └─ books/{bookId}.json     # 单册完整内容（知识点 + 全部题目）
```

## 数据口径

- 只保留 `subject=math` 且 `grade<=6` 的 **人教版** 12 册（`g1up` … `g6down`）。
- 其他学科、其他版本（北师大/苏教/浙教）、初中/高中/大学内容一律不进入产物。
- 源数据来自主工程 `apps/web/public/data/`，源文件不改动；构建时做三类处理：
  1. 裁剪字段（丢掉 TTS 音频、分值等前端不用的字段）；
  2. 修复历史脚本造成的 LaTeX 损坏（反斜杠被写成 `\b`/`\t`/`\f` 等控制字符）；
  3. `fill_blank` 的填空横线、`\text{_}` 统一渲染成等宽下划线。

## 自检

```bash
node verify-data.mjs
```

会核对册数/题量，并把全部 7,153 条公式交给 KaTeX 解析，失败即非零退出。

## 进度存储

浏览器 `localStorage`：

- `pmath.progress.v1` — 每节课最近的最佳答对数
- `pmath.grade.v1` — 上次选择的年级

主工程已完成精简：`apps/desktop`（Tauri）、`apps/mobile`（Capacitor）、`apps/native-android`、
`apps/server`（在线 AI 后端）、`apps/lite` 与 Docker 打包脚本均已移除。`apps/web` 仅作为教材数据源保留
（`build-data.mjs` 从 `apps/web/public/data/` 抽取 12 册数学数据）。
