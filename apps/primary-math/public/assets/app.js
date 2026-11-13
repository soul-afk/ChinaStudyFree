/* ============================================================
   小学数学 · 简约网页版
   纯静态前端：hash 路由 + 原生 DOM，无框架、无构建依赖。
   数据来自 data/index.json 与 data/books/{bookId}.json
   ============================================================ */

(function () {
  "use strict";

  var PKEY = "pmath.progress.v1";
  var GKEY = "pmath.grade.v1";

  var TYPE_LABEL = {
    choice: "选择题",
    true_false: "判断题",
    fill_blank: "填空题",
    calculation: "计算题",
    fill_blank_text: "填空题",
  };

  var indexCache = null;
  var bookCache = {};
  var app = null;

  /* ---------------- 进度存储 ---------------- */
  function loadProgress() {
    try {
      var raw = localStorage.getItem(PKEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function saveProgress(progress) {
    try {
      localStorage.setItem(PKEY, JSON.stringify(progress));
    } catch (e) {
      /* 忽略隐私模式下的写入失败 */
    }
  }

  function progressStats(progress) {
    var done = 0;
    var full = 0;
    Object.keys(progress).forEach(function (k) {
      done += 1;
      if (progress[k].best === progress[k].total) full += 1;
    });
    return { done: done, full: full };
  }

  /* ---------------- 文本 / 公式 ---------------- */
  function splitMath(text) {
    var parts = [];
    var s = String(text == null ? "" : text);
    var i = 0;
    while (i < s.length) {
      var ch = s.charAt(i);
      if (ch === "$") {
        var isBlock = s.charAt(i + 1) === "$";
        var open = isBlock ? 2 : 1;
        var end = s.indexOf(isBlock ? "$$" : "$", i + open);
        if (end === -1) {
          parts.push({ type: "text", value: s.slice(i) });
          break;
        }
        parts.push({ type: isBlock ? "block" : "inline", value: s.slice(i + open, end) });
        i = end + open;
      } else {
        var next = s.indexOf("$", i);
        if (next === -1) {
          parts.push({ type: "text", value: s.slice(i) });
          break;
        }
        parts.push({ type: "text", value: s.slice(i, next) });
        i = next;
      }
    }
    return parts;
  }

  function richText(text) {
    var frag = document.createDocumentFragment();
    splitMath(text).forEach(function (p) {
      if (p.type === "text") {
        frag.appendChild(document.createTextNode(p.value));
        return;
      }
      var span = document.createElement("span");
      if (p.type === "block") span.className = "math-block";
      try {
        span.innerHTML = window.katex.renderToString(p.value, {
          throwOnError: false,
          displayMode: p.type === "block",
        });
      } catch (e) {
        span.textContent = p.value;
      }
      frag.appendChild(span);
    });
    return frag;
  }

  function setRich(target, text) {
    target.textContent = "";
    target.appendChild(richText(text));
  }

  /* ---------------- 答案判定 ---------------- */
  function norm(s) {
    return String(s == null ? "" : s)
      .normalize("NFKC")
      .replace(/\s+/g, "")
      .replace(/[。．,，]/g, "")
      .toLowerCase();
  }

  function isCorrect(input, answer) {
    var a = norm(input);
    var b = norm(answer);
    if (a === b) return true;
    // 允许题库里用「/」「|」「或」并列多个可接受答案
    return String(answer)
      .split(/[|/]|或/)
      .map(norm)
      .some(function (x) {
        return x !== "" && x === a;
      });
  }

  /* ---------------- 数据读取 ---------------- */
  async function getIndex() {
    if (!indexCache) {
      var r = await fetch("data/index.json");
      indexCache = await r.json();
    }
    return indexCache;
  }

  async function getBook(id) {
    if (!bookCache[id]) {
      var r = await fetch("data/books/" + id + ".json");
      if (!r.ok) throw new Error("book not found: " + id);
      bookCache[id] = await r.json();
    }
    return bookCache[id];
  }

  function bookIdOfLesson(lessonId, index) {
    var ids = index.books
      .map(function (b) { return b.id; })
      .sort(function (a, b) { return b.length - a.length; });
    for (var i = 0; i < ids.length; i++) {
      if (lessonId.indexOf(ids[i] + "-") === 0) return ids[i];
    }
    return null;
  }

  /* ---------------- 小工具 ---------------- */
  function fmt(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  function h(tag, className) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    return node;
  }

  function topProgressText() {
    var node = document.getElementById("top-progress");
    if (!node) return;
    var stats = progressStats(loadProgress());
    var total = indexCache ? indexCache.totalLessons : 0;
    node.textContent = total ? "已完成 " + stats.done + " / " + total + " 节" : "";
  }

  /* ---------------- 首页 ---------------- */
  async function renderHome() {
    var index = await getIndex();
    app.textContent = "";

    var hero = h("section", "hero");
    var title = h("h1");
    title.textContent = index.title || "小学数学";
    var lede = h("p");
    lede.textContent =
      (index.subtitle || "") +
      " · " + index.totalBooks + " 册 · " +
      index.totalLessons + " 节课 · " +
      fmt(index.totalQuestions) + " 道题";
    hero.appendChild(title);
    hero.appendChild(lede);
    app.appendChild(hero);

    var savedGrade = Number(localStorage.getItem(GKEY)) || 1;
    if (!index.grades.some(function (g) { return g.grade === savedGrade; })) savedGrade = 1;

    var tabs = h("div", "grade-tabs");
    tabs.setAttribute("role", "tablist");
    index.grades.forEach(function (g) {
      var btn = h("button", "grade-tab");
      btn.type = "button";
      btn.textContent = g.name;
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", String(g.grade === savedGrade));
      btn.addEventListener("click", function () {
        localStorage.setItem(GKEY, String(g.grade));
        renderHome();
      });
      tabs.appendChild(btn);
    });
    app.appendChild(tabs);

    var grid = h("div", "book-grid");
    var progress = loadProgress();
    var current = index.grades.filter(function (g) { return g.grade === savedGrade; })[0];
    (current ? current.books : []).forEach(function (bookId) {
      var book = index.books.filter(function (b) { return b.id === bookId; })[0];
      if (!book) return;
      var doneLessons = Object.keys(progress).filter(function (k) {
        return progress[k].book === book.id;
      }).length;
      var pct = book.lessonsCount ? Math.round((doneLessons / book.lessonsCount) * 100) : 0;

      var card = h("a", "book-card");
      card.href = "#/book/" + book.id;
      var name = h("div", "book-name");
      name.textContent = book.gradeName + book.semesterName;
      var meta = h("div", "book-meta");
      meta.textContent = book.unitsCount + " 单元 · " + book.lessonsCount + " 节课 · " + book.questionCount + " 道题";
      var bar = h("div", "bar");
      var fill = h("i");
      fill.style.width = pct + "%";
      bar.appendChild(fill);
      var state = h("div", "book-state");
      state.textContent = doneLessons ? "已完成 " + doneLessons + " / " + book.lessonsCount + " 节" : "尚未开始";
      card.appendChild(name);
      card.appendChild(meta);
      card.appendChild(bar);
      card.appendChild(state);
      grid.appendChild(card);
    });
    if (!grid.childNodes.length) {
      var empty = h("div", "empty");
      empty.textContent = "暂无数据，请先运行 node build-data.mjs";
      grid.appendChild(empty);
    }
    app.appendChild(grid);
    topProgressText();
  }

  /* ---------------- 书目页 ---------------- */
  async function renderBook(bookId) {
    var loading = h("div", "loading");
    loading.textContent = "载入中…";
    app.textContent = "";
    app.appendChild(loading);

    var book;
    try {
      book = await getBook(bookId);
    } catch (e) {
      app.textContent = "";
      var err = h("div", "empty");
      err.textContent = "找不到这本教材。";
      app.appendChild(err);
      return;
    }

    app.textContent = "";
    var progress = loadProgress();
    var doneLessons = Object.keys(progress).filter(function (k) {
      return progress[k].book === book.id;
    }).length;

    var crumbs = h("nav", "crumbs");
    var homeLink = h("a");
    homeLink.href = "#/";
    homeLink.textContent = "小学数学";
    crumbs.appendChild(homeLink);
    var sep = h("span", "sep");
    sep.textContent = "/";
    crumbs.appendChild(sep);
    crumbs.appendChild(document.createTextNode(book.gradeName + book.semesterName));
    app.appendChild(crumbs);

    var head = h("header", "page-head");
    var h1 = h("h1");
    h1.textContent = book.gradeName + book.semesterName;
    var meta = h("div", "meta");
    [book.publisherName, book.unitsCount + " 单元", book.lessonsCount + " 节课",
      book.questionCount + " 道题", "已完成 " + doneLessons + " 节"].forEach(function (t) {
      var s = h("span");
      s.textContent = t;
      meta.appendChild(s);
    });
    head.appendChild(h1);
    head.appendChild(meta);
    app.appendChild(head);

    var CN = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];

    book.units.forEach(function (unit) {
      var section = h("section", "unit");
      var uh = h("div", "unit-head");
      var no = h("span", "unit-no");
      no.textContent = "第" + (CN[unit.n - 1] || unit.n) + "单元";
      var ttl = h("h2");
      ttl.textContent = unit.title;
      var cnt = h("span", "unit-count");
      cnt.textContent = unit.lessonIds.length + " 节课";
      uh.appendChild(no);
      uh.appendChild(ttl);
      uh.appendChild(cnt);
      section.appendChild(uh);

      unit.lessonIds.forEach(function (lid, i) {
        var lesson = book.lessons.filter(function (l) { return l.id === lid; })[0];
        if (!lesson) return;
        var row = h("a", "lesson-row");
        row.href = "#/lesson/" + lesson.id;

        var num = h("span", "num");
        num.textContent = String(i + 1).padStart(2, "0");
        var name = h("span", "ttl");
        name.textContent = lesson.isExam ? "单元测验" : lesson.title;
        if (lesson.isExam) name.className = "ttl exam";
        var qc = h("span", "q-count");
        qc.textContent = lesson.questions.length + " 题";
        var st = h("span", "state");
        var rec = progress[lesson.id];
        if (!rec) {
          st.textContent = "未开始";
        } else if (rec.best === rec.total) {
          st.textContent = "全对";
          st.className = "state done";
        } else {
          st.textContent = "答对 " + rec.best + "/" + rec.total;
        }

        row.appendChild(num);
        row.appendChild(name);
        row.appendChild(qc);
        row.appendChild(st);
        section.appendChild(row);
      });

      app.appendChild(section);
    });

    topProgressText();
  }

  /* ---------------- 课时页 ---------------- */
  async function renderLesson(lessonId) {
    var loading = h("div", "loading");
    loading.textContent = "载入中…";
    app.textContent = "";
    app.appendChild(loading);

    var index = await getIndex();
    var bookId = bookIdOfLesson(lessonId, index);
    if (!bookId) {
      app.textContent = "找不到这节课。";
      return;
    }

    var book = null;
    try {
      book = await getBook(bookId);
    } catch (e) {
      app.textContent = "";
      var fail = h("div", "empty");
      fail.textContent = "内容载入失败，请确认本地服务已启动（node serve.mjs）。";
      app.appendChild(fail);
      return;
    }
    var lesson = book.lessons.filter(function (l) { return l.id === lessonId; })[0];
    if (!lesson) {
      app.textContent = "找不到这节课。";
      return;
    }

    var order = book.units.reduce(function (acc, u) {
      return acc.concat(u.lessonIds);
    }, []);
    var nextId = order[order.indexOf(lessonId) + 1] || null;

    app.textContent = "";

    var crumbs = h("nav", "crumbs");
    var homeLink = h("a");
    homeLink.href = "#/";
    homeLink.textContent = "小学数学";
    crumbs.appendChild(homeLink);
    crumbs.appendChild(makeSep());
    var bookLink = h("a");
    bookLink.href = "#/book/" + book.id;
    bookLink.textContent = book.gradeName + book.semesterName;
    crumbs.appendChild(bookLink);
    crumbs.appendChild(makeSep());
    crumbs.appendChild(document.createTextNode(lesson.unitTitle));
    app.appendChild(crumbs);

    var head = h("header", "lesson-head");
    var h1 = h("h1");
    h1.textContent = lesson.title;
    var meta = h("div", "meta");
    meta.textContent =
      "第 " + lesson.unitNumber + " 单元 · " + lesson.questions.length + " 道题";
    head.appendChild(h1);
    head.appendChild(meta);
    app.appendChild(head);

    if (lesson.knowledge) app.appendChild(buildKnowledge(lesson.knowledge));
    app.appendChild(buildQuiz(book, lesson, nextId));

    topProgressText();
  }

  function makeSep() {
    var s = h("span", "sep");
    s.textContent = "/";
    return s;
  }

  function buildKnowledge(k) {
    var box = h("details", "knowledge");
    var summary = h("summary");
    var chev = h("span", "chev");
    summary.appendChild(chev);
    summary.appendChild(document.createTextNode("本课知识点"));
    box.appendChild(summary);

    var body = h("div", "knowledge-body");
    var dl = h("dl");

    function add(term, value, isList) {
      var dt = h("dt");
      dt.textContent = term;
      var dd = h("dd");
      if (isList) {
        var ul = h("ul");
        (value || []).forEach(function (v) {
          var li = h("li");
          setRich(li, v);
          ul.appendChild(li);
        });
        dd.appendChild(ul);
      } else {
        setRich(dd, value || "—");
      }
      dl.appendChild(dt);
      dl.appendChild(dd);
    }

    add("核心概念", k.core_concept);
    if (k.key_formula) add("关键公式", k.key_formula);
    if (k.tips) add("小提示", k.tips);
    if (k.common_mistakes && k.common_mistakes.length) {
      add("易错点", k.common_mistakes, true);
    }
    body.appendChild(dl);
    box.appendChild(body);
    return box;
  }

  function buildQuiz(book, lesson, nextId) {
    var questions = lesson.questions;
    var answers = questions.map(function () {
      return { value: "", checked: false, correct: false };
    });
    var cursor = 0;
    var finished = false;

    var quiz = h("section", "quiz");

    var head = h("div", "quiz-head");
    var indexLabel = h("span", "index");
    var typeLabel = h("span", "type");
    var bar = h("div", "bar");
    var fill = h("i");
    bar.appendChild(fill);
    head.appendChild(indexLabel);
    head.appendChild(bar);
    head.appendChild(typeLabel);
    quiz.appendChild(head);

    var qText = h("div", "question-text");
    quiz.appendChild(qText);

    var answerArea = h("div", "answer-area");
    quiz.appendChild(answerArea);

    var feedback = h("div", "feedback");
    feedback.hidden = true;
    feedback.setAttribute("aria-live", "polite");
    quiz.appendChild(feedback);

    var actions = h("div", "actions");
    var prevBtn = h("button", "btn ghost");
    prevBtn.type = "button";
    prevBtn.textContent = "上一题";
    var spacer = h("span", "spacer");
    var mainBtn = h("button", "btn primary");
    mainBtn.type = "button";
    mainBtn.textContent = "确认答案";
    actions.appendChild(prevBtn);
    actions.appendChild(spacer);
    actions.appendChild(mainBtn);
    quiz.appendChild(actions);

    function renderQuestion() {
      var q = questions[cursor];
      var a = answers[cursor];

      indexLabel.textContent = "第 " + (cursor + 1) + " / " + questions.length + " 题";
      typeLabel.textContent = TYPE_LABEL[q.type] || "题目";
      fill.style.width = ((cursor + 1) / questions.length) * 100 + "%";

      setRich(qText, q.question);
      answerArea.textContent = "";
      feedback.hidden = true;
      feedback.className = "feedback";

      if (q.type === "choice") {
        var list = h("div", "options");
        q.options.forEach(function (opt, i) {
          var btn = h("button", "option");
          btn.type = "button";
          var key = h("span", "key");
          key.textContent = String.fromCharCode(65 + i) + ".";
          var label = h("span");
          setRich(label, opt);
          btn.appendChild(key);
          btn.appendChild(label);
          btn.setAttribute("aria-pressed", String(a.value === opt));
          if (a.checked) {
            btn.disabled = true;
            if (norm(opt) === norm(q.answer)) btn.classList.add("is-right");
            else if (a.value === opt) btn.classList.add("is-wrong");
          } else {
            btn.addEventListener("click", function () {
              a.value = opt;
              Array.prototype.forEach.call(list.children, function (c, j) {
                c.setAttribute("aria-pressed", String(j === i));
              });
            });
          }
          list.appendChild(btn);
        });
        answerArea.appendChild(list);
      } else if (q.type === "true_false") {
        var tf = h("div", "options");
        ["对", "错"].forEach(function (opt, i) {
          var btn = h("button", "option");
          btn.type = "button";
          var key = h("span", "key");
          key.textContent = opt === "对" ? "✓" : "✕";
          var label = h("span");
          label.textContent = opt;
          btn.appendChild(key);
          btn.appendChild(label);
          btn.setAttribute("aria-pressed", String(a.value === opt));
          if (a.checked) {
            btn.disabled = true;
            if (norm(opt) === norm(q.answer)) btn.classList.add("is-right");
            else if (a.value === opt) btn.classList.add("is-wrong");
          } else {
            btn.addEventListener("click", function () {
              a.value = opt;
              Array.prototype.forEach.call(tf.children, function (c, j) {
                c.setAttribute("aria-pressed", String(j === i));
              });
            });
          }
          tf.appendChild(btn);
        });
        answerArea.appendChild(tf);
      } else {
        var wrap = h("div", "input-answer");
        var input = document.createElement("input");
        input.type = "text";
        input.inputMode = "text";
        input.autocomplete = "off";
        input.placeholder = "在这里输入答案";
        input.value = a.value;
        input.disabled = a.checked;
        input.addEventListener("input", function () { a.value = input.value; });
        input.addEventListener("keydown", function (e) {
          if (e.key === "Enter") {
            e.preventDefault();
            mainBtn.click();
          }
        });
        wrap.appendChild(input);
        answerArea.appendChild(wrap);
      }

      if (a.checked) showFeedback();

      prevBtn.disabled = cursor === 0 || finished;
      mainBtn.textContent = a.checked
        ? cursor === questions.length - 1 ? "查看结果" : "下一题"
        : "确认答案";

      if (!a.checked) {
        var focusable = answerArea.querySelector("input");
        if (focusable) setTimeout(function () { focusable.focus(); }, 0);
      }
    }

    function showFeedback() {
      var q = questions[cursor];
      var a = answers[cursor];
      feedback.hidden = false;
      feedback.className = "feedback " + (a.correct ? "ok" : "bad");

      var verdict = h("span", "verdict " + (a.correct ? "ok" : "bad"));
      verdict.textContent = a.correct ? "答对了" : "答错了";
      feedback.appendChild(verdict);

      var explain = h("span", "explain");
      if (a.correct) {
        setRich(explain, q.explanation || "继续保持。");
      } else {
        explain.textContent = "正确答案：" + q.answer + "　";
        var e2 = h("span");
        setRich(e2, q.explanation || "");
        explain.appendChild(e2);
      }
      feedback.appendChild(explain);
    }

    function gradeCurrent() {
      var q = questions[cursor];
      var a = answers[cursor];
      if (a.value == null || String(a.value).trim() === "") {
        feedback.hidden = false;
        feedback.className = "feedback bad";
        feedback.textContent = "";
        var v = h("span", "verdict bad");
        v.textContent = "还没作答";
        feedback.appendChild(v);
        var hint = h("span", "explain");
        hint.textContent = "请先选择或填写答案。";
        feedback.appendChild(hint);
        return false;
      }
      a.checked = true;
      a.correct = isCorrect(a.value, q.answer);
      return true;
    }

    function finish() {
      finished = true;
      var correct = answers.filter(function (a) { return a.correct; }).length;
      var total = questions.length;

      var progress = loadProgress();
      var prev = progress[lesson.id];
      var best = prev && prev.best > correct ? prev.best : correct;
      var bestTotal = prev && prev.total === total ? prev.total : total;
      progress[lesson.id] = { book: book.id, best: best, total: bestTotal };
      saveProgress(progress);

      quiz.textContent = "";
      var box = h("div", "result");
      var score = h("div", "score");
      score.textContent = correct;
      var small = document.createElement("small");
      small.textContent = " / " + total;
      score.appendChild(small);
      var rate = h("div", "rate");
      rate.textContent = "正确率 " + Math.round((correct / total) * 100) + "%　·　最佳记录 " + best + "/" + bestTotal;
      box.appendChild(score);
      box.appendChild(rate);

      var acts = h("div", "actions");
      var backBtn = h("button", "btn");
      backBtn.type = "button";
      backBtn.textContent = "返回单元";
      backBtn.addEventListener("click", function () {
        location.hash = "#/book/" + book.id;
      });
      var retry = h("button", "btn");
      retry.type = "button";
      retry.textContent = "再做一遍";
      retry.addEventListener("click", function () { renderLesson(lesson.id); });
      acts.appendChild(backBtn);
      acts.appendChild(retry);
      if (nextId) {
        var next = h("a", "btn primary");
        next.href = "#/lesson/" + nextId;
        next.textContent = "下一节课";
        acts.appendChild(next);
      }
      box.appendChild(acts);
      quiz.appendChild(box);
      topProgressText();
    }

    mainBtn.addEventListener("click", function () {
      if (finished) return;
      if (!answers[cursor].checked) {
        if (gradeCurrent()) renderQuestion();
        return;
      }
      if (cursor === questions.length - 1) {
        finish();
      } else {
        cursor += 1;
        renderQuestion();
      }
    });

    prevBtn.addEventListener("click", function () {
      if (cursor > 0) {
        cursor -= 1;
        renderQuestion();
      }
    });

    renderQuestion();
    return quiz;
  }

  /* ---------------- 路由 ---------------- */
  async function route() {
    var hash = location.hash.replace(/^#/, "");
    if (!hash || hash === "/") {
      await renderHome();
      return;
    }
    var parts = hash.split("/").filter(Boolean);
    if (parts[0] === "book" && parts[1]) {
      await renderBook(decodeURIComponent(parts[1]));
      return;
    }
    if (parts[0] === "lesson" && parts[1]) {
      await renderLesson(decodeURIComponent(parts[1]));
      return;
    }
    await renderHome();
  }

  window.addEventListener("hashchange", route);

  document.addEventListener("DOMContentLoaded", function () {
    app = document.getElementById("app");
    route();
  });
})();
