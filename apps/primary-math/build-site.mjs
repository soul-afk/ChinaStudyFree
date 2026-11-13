/**
 * build-site.mjs — 生成可直接上传的静态站点目录 dist/
 * 产物：dist/（等价于 public/，额外带 .nojekyll，便于 GitHub Pages）
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, "public");
const OUT = path.resolve(__dirname, "dist");

fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(SRC, OUT, { recursive: true });

// GitHub Pages 默认走 Jekyll，加这个文件跳过处理
fs.writeFileSync(path.join(OUT, ".nojekyll"), "", "utf8");

// 纯静态站点：任意路径回落到首页由前端 hash 路由处理，这里给一个 404 兜底
fs.copyFileSync(path.join(SRC, "index.html"), path.join(OUT, "404.html"));

let files = 0;
let bytes = 0;
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else {
      files += 1;
      bytes += fs.statSync(full).size;
    }
  }
}
walk(OUT);

console.log(`dist/ 生成完成：${files} 个文件，${(bytes / 1024 / 1024).toFixed(2)} MB`);
console.log("上传 / 部署时，把 dist 目录（或它的 zip）作为站点根目录即可。");
