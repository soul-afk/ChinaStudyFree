/**
 * serve.mjs — 零依赖静态服务器
 * 用法：node serve.mjs [port]
 */

import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "public");
const PORT = Number(process.argv[2] || process.env.PORT || 5180);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".ico": "image/x-icon",
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  let filePath = path.join(ROOT, urlPath);
  if (!path.resolve(filePath).startsWith(ROOT)) {
    res.writeHead(403).end("403");
    return;
  }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      // 单页应用：未知路径回落到 index.html
      fs.readFile(path.join(ROOT, "index.html"), (e2, html) => {
        if (e2) {
          res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("404 Not Found");
          return;
        }
        res.writeHead(200, { "Content-Type": MIME[".html"] }).end(html);
      });
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const noCache = [".html", ".js", ".css", ".json", ".mjs"].includes(ext);
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": noCache ? "no-cache" : "max-age=86400",
    });
    res.end(data);
  });
});

let port = PORT;
let tries = 0;

function start() {
  server.listen(port);
}

server.on("listening", () => {
  console.log(`小学数学 · 简约网页版  →  http://localhost:${port}`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE" && tries < 10) {
    console.log(`端口 ${port} 被占用，改用 ${port + 1} …`);
    port += 1;
    tries += 1;
    setTimeout(start, 100);
    return;
  }
  console.error(`启动失败：${err.message}`);
  process.exit(1);
});

start();
