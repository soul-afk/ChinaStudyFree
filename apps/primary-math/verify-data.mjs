/**
 * verify-data.mjs — 数据与公式自检
 * 1) 12 册数据齐全、题量统计
 * 2) 每条 $...$ 公式能否被 KaTeX 正常解析（抛错即记一条）
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import katex from "katex";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.resolve(__dirname, "public", "data");

const index = JSON.parse(fs.readFileSync(path.join(DIR, "index.json"), "utf8"));
console.log(`册数 ${index.totalBooks} / 课时 ${index.totalLessons} / 题目 ${index.totalQuestions}`);

const books = fs.readdirSync(path.join(DIR, "books")).filter(f => f.endsWith(".json"));
if (books.length !== 12) throw new Error(`期望 12 册数据，实际 ${books.length}`);

let formulaCount = 0;
const errors = [];
const types = {};

function checkText(text, where) {
  if (typeof text !== "string") return;
  const re = /\$([^$]+)\$/g;
  let m;
  while ((m = re.exec(text))) {
    formulaCount++;
    try {
      katex.renderToString(m[1], { throwOnError: true, displayMode: false });
    } catch (e) {
      if (errors.length < 20) errors.push(`${where} :: ${m[1]} :: ${e.message}`);
      else errors.length++;
    }
  }
}

let questions = 0;
for (const f of books) {
  const book = JSON.parse(fs.readFileSync(path.join(DIR, "books", f), "utf8"));
  if (![1, 2, 3, 4, 5, 6].includes(book.grade)) throw new Error(`${f} 年级异常 ${book.grade}`);
  for (const lesson of book.lessons) {
    for (const q of lesson.questions) {
      questions++;
      types[q.type] = (types[q.type] || 0) + 1;
      checkText(q.question, `${lesson.id}/q${q.id}`);
      checkText(q.explanation, `${lesson.id}/q${q.id}/解析`);
      (q.options || []).forEach(o => checkText(o, `${lesson.id}/q${q.id}/选项`));
    }
    if (lesson.knowledge) {
      const k = lesson.knowledge;
      checkText(k.core_concept, `${lesson.id}/知识点`);
      checkText(k.key_formula, `${lesson.id}/公式`);
      checkText(k.tips, `${lesson.id}/提示`);
      (k.common_mistakes || []).forEach(x => checkText(x, `${lesson.id}/易错点`));
    }
  }
}

console.log(`题目统计 ${questions}，题型 ${JSON.stringify(types)}`);
console.log(`公式 ${formulaCount} 条，解析失败 ${errors.length} 条`);
if (errors.length) {
  console.log(errors.slice(0, 10).join("\n"));
  process.exitCode = 1;
} else {
  console.log("✅ 全部公式可渲染");
}
