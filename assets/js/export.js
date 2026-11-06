/* Staff page: fetch the register and build Excel workbooks with one sheet per class (course + year of study). */
(function () {
  "use strict";
  const { CFG, LIVE, post, excelReady } = window.FEAS;
  const $ = s => document.querySelector(s);
  const status = $("#status");
  let KEY = "", DATA = null;

  const NAVY = "FF1F3A5F", GOLD = "FFF2C200", PALE = "FFF7F3EA";
  const progIndex = name => { const i = CFG.PROGRAMMES.findIndex(p => p.name === name); return i < 0 ? 99 : i; };
  const shortOf = name => (CFG.PROGRAMMES.find(p => p.name === name) || {}).short || String(name).slice(0, 18);
  const yearNum = y => { const m = String(y || "").match(/\d+/); return m ? +m[0] : 0; };
  const localDate = iso => { if (!iso) return null; const d = new Date(iso); return isNaN(d) ? null : new Date(d.getTime() - d.getTimezoneOffset() * 60000); };
  const today = () => new Date().toISOString().slice(0, 10);

  function setStatus(msg, kind) { status.textContent = msg; status.className = "status " + (kind || ""); status.hidden = !msg; }

  async function load() {
    setStatus("Reading the register…", "busy");
    if (!LIVE) throw new Error("This site is not connected to the register yet (API_URL in config.js).");
    DATA = await post({ action: "export", key: KEY });
    DATA.letters.forEach(r => { r._prog = r.programme; r._year = yearNum(r["Year of Study"]); });
    DATA.placements.forEach(r => { r._prog = r["Programme"]; r._year = yearNum(r["Year of Study"]); });
    DATA.projects = DATA.projects || [];
    DATA.intros = DATA.intros || [];
    DATA.recs = DATA.recs || [];
    DATA.intros.forEach(r => { r._prog = r["Programme"]; r._year = yearNum(r["Year of Study"]); });
    DATA.projects.forEach(r => { r._prog = r["Programme"]; r._year = yearNum(r["Year of Study"]); });
    setStatus("", "");
    $("#asof").textContent = "Signed in as " + (DATA.staff || "staff") + ". Register read at " + new Date(DATA.generatedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) +
      " · " + [[DATA.letters.length, "letter"], [DATA.placements.length, "confirmed placement"], [DATA.projects.length, "project title"], [DATA.intros.length, "introductory letter"]]
        .map(([n, w]) => n + " " + w + (n === 1 ? "" : "s")).join(" · ");
    renderSummary();
    $("#panel").hidden = false;
  }

  /* ---------- grouping ---------- */
  function classKey(r) { return r._prog + "|" + r._year; }
  function classLabel(prog, year) { return year ? prog + " — Year " + year : prog + " — year not given"; }
  function sheetName(prog, year) { return (shortOf(prog) + " – " + (year ? "Year " + year : "Year ?")).replace(/[\[\]\*\?\/\\:]/g, " ").slice(0, 31); }
  function groupByClass(rows) {
    const m = new Map();
    rows.forEach(r => { const k = classKey(r); if (!m.has(k)) m.set(k, { prog: r._prog, year: r._year, rows: [] }); m.get(k).rows.push(r); });
    return [...m.values()].sort((a, b) => progIndex(a.prog) - progIndex(b.prog) || (a.year || 99) - (b.year || 99));
  }
  const byName = (a, b) => String(a["Student Name"]).localeCompare(String(b["Student Name"]), "en", { sensitivity: "base" });

  // Students with at least one letter but no confirmed placement in the same course (and year, where known).
  function notPlaced() {
    const placed = new Set(DATA.placements.map(p => p["Registration No"] + "|" + p._prog + "|" + p._year));
    const placedAnyYear = new Set(DATA.placements.map(p => p["Registration No"] + "|" + p._prog));
    const m = new Map();
    DATA.letters.forEach(l => {
      const k = l["Registration No"] + "|" + l._prog + "|" + l._year;
      if (l._year ? placed.has(k) : placedAnyYear.has(l["Registration No"] + "|" + l._prog)) return;
      if (!m.has(k)) m.set(k, { _prog: l._prog, _year: l._year, "Student Name": l["Student Name"], "Registration No": l["Registration No"], companies: [] });
      if (l["Student Phone"]) m.get(k)["Student Phone"] = l["Student Phone"];
      if (l["Student Email"]) m.get(k)["Student Email"] = l["Student Email"];
      m.get(k).companies.push(l["Company / Organisation"]);
    });
    return [...m.values()];
  }

  function summaryRows() {
    const classes = new Map();
    const get = (prog, year) => { const k = prog + "|" + year; if (!classes.has(k)) classes.set(k, { prog, year, letters: 0, applicants: new Set(), placed: 0 }); return classes.get(k); };
    DATA.letters.forEach(l => { const c = get(l._prog, l._year); c.letters++; c.applicants.add(l["Registration No"]); });
    DATA.placements.forEach(p => get(p._prog, p._year).placed++);
    const waiting = {}; notPlaced().forEach(s => { const k = s._prog + "|" + s._year; waiting[k] = (waiting[k] || 0) + 1; });
    return [...classes.values()].sort((a, b) => progIndex(a.prog) - progIndex(b.prog) || (a.year || 99) - (b.year || 99))
      .map(c => ({ course: c.prog, year: c.year ? "Year " + c.year : "?", applicants: c.applicants.size, letters: c.letters,
                   placed: c.placed, waiting: waiting[c.prog + "|" + c.year] || 0 }));
  }

  function renderSummary() {
    const rows = summaryRows();
    const esc = s => String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
    $("#sum").innerHTML = "<tr><th>Class</th><th class='n'>Applying</th><th class='n'>Letters</th><th class='n'>Placed</th><th class='n'>Not yet placed</th></tr>" +
      (rows.length ? rows.map(r => `<tr><td>${esc(shortOf(r.course))} · ${esc(r.year)}</td><td class="n">${r.applicants}</td><td class="n">${r.letters}</td><td class="n">${r.placed}</td><td class="n">${r.waiting}</td></tr>`).join("")
                   : "<tr><td colspan='5' class='muted'>Nothing recorded yet.</td></tr>");
  }

  /* ---------- workbook helpers ---------- */
  function addSheet(wb, name, title, subtitle, columns, rows) {
    const ws = wb.addWorksheet(name, {
      views: [{ state: "frozen", ySplit: 3 }],
      pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } },
      headerFooter: { oddFooter: "&L" + title.replace(/&/g, "&&") + "&RPage &P of &N" }
    });
    ws.columns = columns.map(c => ({ key: c.key, width: c.width }));
    ws.mergeCells(1, 1, 1, columns.length);
    ws.getCell(1, 1).value = title;
    ws.getCell(1, 1).font = { bold: true, size: 13, color: { argb: NAVY } };
    ws.mergeCells(2, 1, 2, columns.length);
    ws.getCell(2, 1).value = subtitle;
    ws.getCell(2, 1).font = { italic: true, size: 10, color: { argb: "FF6B645A" } };
    const head = ws.getRow(3);
    columns.forEach((c, i) => {
      const cell = head.getCell(i + 1);
      cell.value = c.header;
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
      cell.alignment = { vertical: "middle", wrapText: true };
      cell.border = { bottom: { style: "medium", color: { argb: GOLD } } };
    });
    head.height = 30;
    rows.forEach((r, i) => {
      const row = ws.addRow(columns.map(c => (typeof c.get === "function" ? c.get(r, i) : r[c.key])));
      columns.forEach((c, j) => {
        const cell = row.getCell(j + 1);
        if (c.fmt) cell.numFmt = c.fmt;
        if (cell.value && typeof cell.value === "object" && cell.value.hyperlink) cell.font = { color: { argb: "FF1D3A66" }, underline: true };
        cell.alignment = { vertical: "top", wrapText: !!c.wrap };
        cell.border = { bottom: { style: "hair", color: { argb: "FFD9D2C3" } } };
        if (i % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PALE } };
      });
    });
    if (rows.length) ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3 + rows.length, column: columns.length } };
    ws.pageSetup.printTitlesRow = "3:3";
    return ws;
  }

  async function save(wb, filename) {
    wb.creator = "FEAS Placement Register"; wb.created = new Date();
    const buf = await wb.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  const stamp = () => "Downloaded " + new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) + " from the FEAS placement register";

  /* ---------- placements workbook ---------- */
  async function placementsWorkbook() {
    const wb = new ExcelJS.Workbook();
    const sum = summaryRows();
    addSheet(wb, "Summary", "Industrial training — summary by class", stamp(), [
      { header: "Course", key: "course", width: 58 }, { header: "Year", key: "year", width: 10 },
      { header: "Students applying", key: "applicants", width: 12 }, { header: "Letters issued", key: "letters", width: 12 },
      { header: "Placements confirmed", key: "placed", width: 14 }, { header: "Not yet placed", key: "waiting", width: 12 }
    ], sum);

    const cols = [
      { header: "No.", key: "no", width: 6, get: (r, i) => i + 1 },
      { header: "Student Name", key: "Student Name", width: 30 },
      { header: "Registration No", key: "Registration No", width: 20 },
      { header: "Phone", key: "Student Phone", width: 15 },
      { header: "Email", key: "Student Email", width: 28 },
      { header: "Company Accepted To", key: "Company Accepted To", width: 34, wrap: true },
      { header: "Company Supervisor", key: "Company Supervisor", width: 26, wrap: true },
      { header: "Supervisor Phone", key: "Supervisor Phone", width: 17 },
      { header: "Town", key: "Town", width: 16 },
      { header: "District", key: "District", width: 16 },
      { header: "Distance from Town (km)", key: "km", width: 12, fmt: "0.0", get: r => r["Distance from Town (km)"] === "" || r["Distance from Town (km)"] == null ? "" : Number(r["Distance from Town (km)"]) },
      { header: "Transport Fare (UGX, one way)", key: "fare", width: 14, fmt: "#,##0", get: r => r["Transport Fare (UGX)"] === "" || r["Transport Fare (UGX)"] == null ? "" : Number(r["Transport Fare (UGX)"]) },
      { header: "Placement Letter Ref", key: "Placement Letter Ref", width: 24 },
      { header: "Acceptance Letter", key: "acc", width: 22, get: r => r["Acceptance Letter File"] && r["Acceptance Letter"] === "Uploaded"
          ? { text: "Uploaded (open)", hyperlink: r["Acceptance Letter File"] } : (r["Acceptance Letter"] || "") },
      { header: "Date Submitted", key: "d", width: 15, fmt: "dd mmm yyyy", get: r => localDate(r["Date Submitted"]) }
    ];
    groupByClass(DATA.placements).forEach(g => {
      addSheet(wb, sheetName(g.prog, g.year), classLabel(g.prog, g.year) + " · confirmed placements (" + g.rows.length + ")", stamp(),
               cols, g.rows.slice().sort(byName));
    });

    const toCollect = DATA.placements.filter(r => r["Acceptance Letter"] === "Will bring to office")
      .sort((a, b) => progIndex(a._prog) - progIndex(b._prog) || (a._year || 99) - (b._year || 99) || byName(a, b));
    addSheet(wb, "Acceptance letters to collect", "Students who will bring their acceptance letter to the office (" + toCollect.length + ")", stamp(), [
      { header: "No.", key: "no", width: 6, get: (r, i) => i + 1 },
      { header: "Class", key: "c", width: 22, get: r => shortOf(r._prog) + " – " + (r._year ? "Year " + r._year : "Year ?") },
      { header: "Student Name", key: "Student Name", width: 30 },
      { header: "Registration No", key: "Registration No", width: 20 },
      { header: "Phone", key: "Student Phone", width: 15 },
      { header: "Email", key: "Student Email", width: 28 },
      { header: "Company Accepted To", key: "Company Accepted To", width: 34, wrap: true },
      { header: "Confirmed On", key: "d", width: 15, fmt: "dd mmm yyyy", get: r => localDate(r["Date Submitted"]) }
    ], toCollect);

    const waiting = notPlaced().sort((a, b) => progIndex(a._prog) - progIndex(b._prog) || (a._year || 99) - (b._year || 99) || byName(a, b));
    addSheet(wb, "Not yet placed", "Students with letters but no confirmed placement (" + waiting.length + ")", stamp(), [
      { header: "No.", key: "no", width: 6, get: (r, i) => i + 1 },
      { header: "Class", key: "c", width: 22, get: r => shortOf(r._prog) + " – " + (r._year ? "Year " + r._year : "Year ?") },
      { header: "Student Name", key: "Student Name", width: 30 },
      { header: "Registration No", key: "Registration No", width: 20 },
      { header: "Phone", key: "Student Phone", width: 15 },
      { header: "Email", key: "Student Email", width: 28 },
      { header: "Letters", key: "n", width: 9, get: r => r.companies.length },
      { header: "Companies applied to", key: "co", width: 70, wrap: true, get: r => r.companies.join("; ") }
    ], waiting);

    await save(wb, "FEAS_Placements_by_class_" + today() + ".xlsx");
  }

  /* ---------- letters workbook ---------- */
  async function lettersWorkbook() {
    const wb = new ExcelJS.Workbook();
    const cols = [
      { header: "No.", key: "no", width: 6, get: (r, i) => i + 1 },
      { header: "Student Name", key: "Student Name", width: 30 },
      { header: "Registration No", key: "Registration No", width: 20 },
      { header: "Phone", key: "Student Phone", width: 15 },
      { header: "Email", key: "Student Email", width: 28 },
      { header: "Sex", key: "Sex", width: 9 },
      { header: "Letter No.", key: "Letter No. (this student)", width: 9 },
      { header: "Company / Organisation", key: "Company / Organisation", width: 34, wrap: true },
      { header: "Addressed To", key: "Addressed To", width: 24, wrap: true },
      { header: "Company Address", key: "Company Address", width: 24, wrap: true },
      { header: "Ref No", key: "Ref No", width: 23 },
      { header: "Date Issued", key: "d", width: 14, fmt: "dd mmm yyyy", get: r => localDate(r["Date Issued"]) },
      { header: "Times Verified", key: "Times Verified", width: 10 }
    ];
    const groups = groupByClass(DATA.letters);
    if (!groups.length) addSheet(wb, "Letters", "No letters recorded yet", stamp(), cols, []);
    groups.forEach(g => {
      const rows = g.rows.slice().sort((a, b) => byName(a, b) || (a["Letter No. (this student)"] - b["Letter No. (this student)"]));
      const students = new Set(rows.map(r => r["Registration No"])).size;
      addSheet(wb, sheetName(g.prog, g.year), classLabel(g.prog, g.year) + " · " + rows.length + (rows.length === 1 ? " letter, " : " letters, ") + students + (students === 1 ? " student" : " students"), stamp(), cols, rows);
    });
    const recs = DATA.recs.slice().sort((a, b) => String(b["Date Issued"]).localeCompare(String(a["Date Issued"])));
    addSheet(wb, "Recommendation letters", "Recommendation letters requested (" + recs.length + ")", stamp(), [
      { header: "No.", key: "no", width: 6, get: (r, i) => i + 1 },
      { header: "Date", key: "d", width: 14, fmt: "dd mmm yyyy", get: r => localDate(r["Date Issued"]) },
      { header: "Ref No", key: "Ref No", width: 24 },
      { header: "Class", key: "c", width: 20, get: r => shortOf(r["Programme"]) + " – " + (r["Year of Study"] || "") },
      { header: "Student Name", key: "Student Name", width: 28, wrap: true },
      { header: "Registration No", key: "Registration No", width: 20 },
      { header: "Phone", key: "Student Phone", width: 15 },
      { header: "Email", key: "Student Email", width: 28 },
      { header: "Applying For", key: "Applying For", width: 40, wrap: true },
      { header: "Organisation", key: "Organisation", width: 30, wrap: true },
      { header: "Times Verified", key: "Times Verified", width: 10 }
    ], recs);
    await save(wb, "FEAS_Letters_by_class_" + today() + ".xlsx");
  }

  /* ---------- final-year projects workbook ---------- */
  async function projectsWorkbook() {
    const wb = new ExcelJS.Workbook();
    const cols = [
      { header: "No.", key: "no", width: 6, get: (r, i) => i + 1 },
      { header: "Student Name", key: "Student Name", width: 28, wrap: true },
      { header: "Registration No", key: "Registration No", width: 20 },
      { header: "Phone", key: "Student Phone", width: 15 },
      { header: "Email", key: "Student Email", width: 28 },
      { header: "Project Title", key: "Project Title", width: 60, wrap: true },
      { header: "Supervisor 1", key: "Supervisor 1", width: 24, wrap: true },
      { header: "Supervisor 2", key: "Supervisor 2", width: 24, wrap: true },
      { header: "Supervisor 3", key: "Supervisor 3", width: 24, wrap: true },
      { header: "Previous Title (if changed)", key: "Previous Title", width: 40, wrap: true },
      { header: "Intro Letters", key: "il", width: 10, get: r => DATA.intros.filter(x => x["Registration No"] === r["Registration No"] && x._prog === r._prog).length },
      { header: "Last Updated", key: "d", width: 14, fmt: "dd mmm yyyy", get: r => localDate(r["Last Updated"] || r["Date Submitted"]) }
    ];
    const groups = groupByClass(DATA.projects);
    const introCount = {}, introStudents = {};
    DATA.intros.forEach(r => { const k = r._prog + "|" + r._year; introCount[k] = (introCount[k] || 0) + 1;
                               (introStudents[k] = introStudents[k] || new Set()).add(r["Registration No"]); });
    const counts = groups.map(g => ({ course: g.prog, year: g.year ? "Year " + g.year : "?", n: g.rows.length,
      il: introCount[g.prog + "|" + g.year] || 0, is: (introStudents[g.prog + "|" + g.year] || new Set()).size,
      sups: new Set(g.rows.flatMap(r => [r["Supervisor 1"], r["Supervisor 2"], r["Supervisor 3"]]).filter(Boolean)).size }));
    addSheet(wb, "Summary", "Final-year project titles — summary by course", stamp(), [
      { header: "Course", key: "course", width: 58 }, { header: "Year", key: "year", width: 10 },
      { header: "Project titles", key: "n", width: 12 }, { header: "Different supervisors", key: "sups", width: 14 },
      { header: "Introductory letters", key: "il", width: 13 }, { header: "Students with a letter", key: "is", width: 13 }
    ], counts);
    groups.forEach(g => {
      addSheet(wb, sheetName(g.prog, g.year), classLabel(g.prog, g.year) + " · final-year projects (" + g.rows.length + ")", stamp(),
               cols, g.rows.slice().sort(byName));
    });
    // Supervisor load across the whole Faculty
    const load = new Map();
    DATA.projects.forEach(r => ["Supervisor 1", "Supervisor 2", "Supervisor 3"].forEach(k => {
      const n = String(r[k] || "").trim(); if (!n) return;
      const key = n.toLowerCase().replace(/[^a-z]/g, "");
      if (!load.has(key)) load.set(key, { name: n, students: [] });
      load.get(key).students.push(r["Student Name"] + " (" + shortOf(r._prog) + ")");
    }));
    const supRows = [...load.values()].sort((a, b) => b.students.length - a.students.length || a.name.localeCompare(b.name));
    addSheet(wb, "Supervisors", "Supervision load (names as typed by students)", stamp(), [
      { header: "No.", key: "no", width: 6, get: (r, i) => i + 1 },
      { header: "Supervisor", key: "name", width: 32 },
      { header: "Students", key: "c", width: 10, get: r => r.students.length },
      { header: "Supervising", key: "s", width: 90, wrap: true, get: r => r.students.join("; ") }
    ], supRows);
    const intros = DATA.intros.slice().sort((a, b) => String(b["Date Issued"]).localeCompare(String(a["Date Issued"])));
    addSheet(wb, "Introductory letters", "Project introductory letters issued (" + intros.length + ")", stamp(), [
      { header: "No.", key: "no", width: 6, get: (r, i) => i + 1 },
      { header: "Date Issued", key: "d", width: 14, fmt: "dd mmm yyyy", get: r => localDate(r["Date Issued"]) },
      { header: "Ref No", key: "Ref No", width: 24 },
      { header: "Class", key: "c", width: 20, get: r => shortOf(r._prog) + " – " + (r._year ? "Year " + r._year : "Year ?") },
      { header: "Student Name", key: "Student Name", width: 28, wrap: true },
      { header: "Registration No", key: "Registration No", width: 20 },
      { header: "Phone", key: "Student Phone", width: 15 },
      { header: "Email", key: "Student Email", width: 28 },
      { header: "Sex", key: "Sex", width: 9 },
      { header: "Project Title", key: "Project Title", width: 60, wrap: true },
      { header: "Letter No.", key: "Letter No. (this student)", width: 9 },
      { header: "Times Verified", key: "Times Verified", width: 10 }
    ], intros);
    await save(wb, "FEAS_Final_Year_Projects_" + today() + ".xlsx");
  }

  /* ---------- wiring ---------- */
  $("#login").addEventListener("submit", async e => {
    e.preventDefault();
    KEY = $("#key").value;
    try { await load(); $("#login").hidden = true; excelReady().catch(() => {}); } catch (err) { setStatus(err.message || "Could not open the register.", "error"); }
  });
  async function run(btn, fn) {
    btn.disabled = true;
    try { if (fn !== load) await excelReady(); await fn(); } catch (err) { console.error(err); alert(err.message || "Download failed."); } finally { btn.disabled = false; }
  }
  $("#dlPlacements").addEventListener("click", e => run(e.currentTarget, placementsWorkbook));
  $("#dlLetters").addEventListener("click", e => run(e.currentTarget, lettersWorkbook));
  $("#dlProjects").addEventListener("click", e => run(e.currentTarget, projectsWorkbook));
  $("#refresh").addEventListener("click", e => run(e.currentTarget, load));
})();
