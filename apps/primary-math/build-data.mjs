/**
 * build-data.mjs — 从主工程抽取「小学数学（人教版 1–6 年级）」数据
 *
 * 源：../../apps/web/public/data/books/{bookId}/
 *     outline.json + lessons/*.json
 * 目标：./public/data/
 *     index.json            首页索引（书目 + 单元 + 课时元信息）
 *     books/{bookId}.json   单册完整内容（大纲 + 全部课时题目/知识点）
 *
 * 只保留 人教版 一年级~六年级 上下册，共 12 册；其他学科、其他版本、
 * 初中/高中/大学内容一律不进入产物。
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_DATA = path.resolve(__dirname, "..", "web", "public", "data");
const DST_DATA = path.resolve(__dirname, "public", "data");

/** 允许的教材：人教版小学数学 g1up … g6down */
const BOOK_IDS = [
  "g1up", "g1down",
  "g2up", "g2down",
  "g3up", "g3down",
  "g4up", "g4down",
  "g5up", "g5down",
  "g6up", "g6down",
];

const GRADE_CN = ["一", "二", "三", "四", "五", "六"];

/** 题库里有少量 LaTeX 拼写错误（\bdiv / \bdot），另有历史脚本把反斜杠写成了
 *  控制字符（\b 退格、\t 制表），渲染时会被 KaTeX 标红；
 *  构建阶段统一纠正，源数据不改动。 */
const TEX_CMDS = {
  div: "\\div",
  times: "\\times",
  cdot: "\\cdot",
  bigcirc: "\\bigcirc",
  frac: "\\frac",
  sqrt: "\\sqrt",
  text: "\\text",
  angle: "\\angle",
  circ: "\\circ",
  pm: "\\pm",
  leq: "\\leq",
  geq: "\\geq",
};

/** 历史脚本把 LaTeX 的反斜杠写成了转义控制字符：
 *  "\frac" → 0x0C + "rac"、"\\times" → 0x09 + "imes"、"\\bigcirc" → 0x08 + "igcirc"。
 *  这里按同样的映射反向还原，再修少量拼错的命令与填空横线。 */
const ESC_LETTER = {
  "\u0008": "b",
  "\u0009": "t",
  "\u000A": "n",
  "\u000B": "v",
  "\u000C": "f",
  "\u000D": "r",
};

function repairMath(tex) {
  // 1) 反向还原被吃掉的反斜杠
  let t = tex.replace(/([\u0008-\u000D])([a-zA-Z]*)/g, (m, ctrl, rest) => "\\" + ESC_LETTER[ctrl] + rest);
  // 2) 残留控制字符（后面没有字母）直接去掉
  t = t.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

  // 3) 拼错的命令名
  t = t
    .replace(/\\bdiv/g, "\\div")
    .replace(/\\bdot/g, "\\cdot")
    .replace(/\\rac(?=\{)/g, "\\frac")
    .replace(/\\igcirc/g, "\\bigcirc");

  // 4) 少了反斜杠的命令名（如 div / times / frac）
  t = t.replace(
    /(^|[^\\A-Za-z])(div|times|cdot|bigcirc|frac|sqrt|text|angle|circ|pm|leq|geq)(?![A-Za-z])/g,
    (m, pre, word) => pre + TEX_CMDS[word],
  );

  // 5) 数学模式里的填空占位：_ 或 \text{_} / \text{空白} → 等宽下划线
  t = t
    .replace(/\\text\{\s*_+\s*\}/g, "\\underline{\\hspace{2em}}")
    .replace(/\\text\{(?:\s|\\[btnvfr](?![a-zA-Z]))*\}/g, "\\underline{\\hspace{2em}}")
    .replace(/_{2,}/g, "\\underline{\\hspace{2em}}");

  // 6) 图形被写成了"\big竞"（原为方框），统一还原为 \square
  t = t.replace(/\\?big竞/g, "\\square").replace(/\\?ig竞/g, "\\square");

  return t;
}

/** 只在 $...$ 数学段内修复，普通文本保持原样 */
function fixTex(s) {
  if (typeof s !== "string") return s;
  return s.replace(/\$([^$]+)\$/g, (m, tex) => "$" + repairMath(tex) + "$");
}

function fixDeep(value) {
  if (typeof value === "string") return fixTex(value);
  if (Array.isArray(value)) return value.map(fixDeep);
  if (value && typeof value === "object") {
    const out = {};
    for (const k of Object.keys(value)) out[k] = fixDeep(value[k]);
    return out;
  }
  return value;
}

/** 只留前端要用的字段，去掉 audio / score 等冗余 */
function slimQuestion(q) {
  return {
    id: q.id,
    type: q.type,
    question: fixTex(q.question),
    options: q.options && q.options.length ? q.options.map(fixTex) : [],
    answer: fixTex(q.answer),
    explanation: fixTex(q.explanation ?? ""),
    difficulty: q.difficulty ?? 1,
  };
}

function slimKnowledge(k) {
  if (!k) return null;
  return fixDeep({
    point: k.point,
    core_concept: k.core_concept,
    key_formula: k.key_formula,
    tips: k.tips,
    common_mistakes: Array.isArray(k.common_mistakes) ? k.common_mistakes : [],
  });
}

function main() {
  if (!fs.existsSync(path.join(SRC_DATA, "index.json"))) {
    console.warn("⚠️  未找到 apps/web/public/data，跳过数据重建，沿用 public/data 现有内容。");
    return;
  }

  const index = JSON.parse(fs.readFileSync(path.join(SRC_DATA, "index.json"), "utf8"));
  const metaById = new Map(index.books.map(b => [b.id, b]));

  const booksDir = path.join(DST_DATA, "books");
  fs.rmSync(booksDir, { recursive: true, force: true });
  fs.mkdirSync(booksDir, { recursive: true });

  const outBooks = [];
  const outLessons = {};
  let totalLessons = 0;
  let totalQuestions = 0;

  for (const bookId of BOOK_IDS) {
    const meta = metaById.get(bookId);
    if (!meta) {
      console.warn(`⚠️  源数据缺少 ${bookId}，跳过`);
      continue;
    }
    const srcBookDir = path.join(SRC_DATA, "books", bookId);
    const outline = JSON.parse(fs.readFileSync(path.join(srcBookDir, "outline.json"), "utf8"));
    const srcLessonDir = path.join(srcBookDir, "lessons");

    const lessons = [];
    const lessonFiles = fs.existsSync(srcLessonDir)
      ? fs.readdirSync(srcLessonDir).filter(f => f.endsWith(".json")).sort()
      : [];

    for (const f of lessonFiles) {
      const raw = JSON.parse(fs.readFileSync(path.join(srcLessonDir, f), "utf8"));
      const questions = (raw.questions ?? []).map(slimQuestion);
      if (questions.length === 0) continue;
      lessons.push({
        id: raw.id,
        title: raw.title,
        unitNumber: raw.unitNumber,
        unitTitle: raw.unitTitle,
        kpIndex: raw.kpIndex ?? 0,
        kpTotal: raw.kpTotal ?? 1,
        isExam: /-exam$/.test(raw.id),
        knowledge: slimKnowledge(raw.knowledge),
        questions,
      });
      totalLessons++;
      totalQuestions += questions.length;
    }

    // 单元 → 课时（保持大纲顺序；单元挑战排在最后）
    const units = outline.units.map(u => {
      const unitLessons = lessons
        .filter(l => l.unitNumber === u.unit_number)
        .sort((a, b) => (a.isExam ? 1 : 0) - (b.isExam ? 1 : 0) || a.kpIndex - b.kpIndex);
      return {
        n: u.unit_number,
        title: u.title,
        lessonIds: unitLessons.map(l => l.id),
      };
    });

    const book = {
      id: bookId,
      grade: meta.grade,
      gradeName: meta.gradeName || `${GRADE_CN[meta.grade - 1]}年级`,
      semester: meta.semester,
      semesterName: meta.semesterName || (meta.semester === "up" ? "上册" : "下册"),
      textbookName: meta.textbookName,
      fullName: meta.fullName,
      publisherName: meta.publisherName || "人教版",
      unitsCount: units.length,
      lessonsCount: lessons.length,
      questionCount: lessons.reduce((s, l) => s + l.questions.length, 0),
      units,
      lessons,
    };

    fs.writeFileSync(
      path.join(booksDir, `${bookId}.json`),
      JSON.stringify(book, null, 2),
      "utf8",
    );
    outLessons[bookId] = lessons.length;
    outBooks.push({
      id: bookId,
      grade: book.grade,
      gradeName: book.gradeName,
      semester: book.semester,
      semesterName: book.semesterName,
      textbookName: book.textbookName,
      fullName: book.fullName,
      publisherName: book.publisherName,
      unitsCount: book.unitsCount,
      lessonsCount: book.lessonsCount,
      questionCount: book.questionCount,
    });
    console.log(`✓ ${book.fullName} — ${book.unitsCount} 单元 / ${book.lessonsCount} 节课 / ${book.questionCount} 题`);
  }

  const grades = [1, 2, 3, 4, 5, 6].map(g => ({
    grade: g,
    name: `${GRADE_CN[g - 1]}年级`,
    books: outBooks
      .filter(b => b.grade === g)
      .sort((a, b) => (a.semester === "up" ? -1 : 1) - (b.semester === "up" ? -1 : 1))
      .map(b => b.id),
  }));

  const idx = {
    title: "小学数学",
    subtitle: "人教版 · 一至六年级 · 上下册",
    generatedAt: new Date().toISOString(),
    totalBooks: outBooks.length,
    totalLessons,
    totalQuestions,
    grades,
    books: outBooks,
  };
  fs.writeFileSync(path.join(DST_DATA, "index.json"), JSON.stringify(idx, null, 2), "utf8");

  console.log(`\n合计：${outBooks.length} 册 / ${totalLessons} 节课 / ${totalQuestions} 道题`);
}

main();
