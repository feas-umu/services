/* project.html */
(function () {
  "use strict";
  const { normRegNo, linkRegNo, CFG, LIVE, fillProgrammes, loadStudent, saveStudent, clean, post } = window.FEAS;
  const $ = s => document.querySelector(s);
  const form = $("#projectForm"), btn = $("#submitBtn"), status = $("#status"), sups = $("#sups");
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const MAX = 3;

  fillProgrammes($("#programme"));
  if (CFG.REQUIRE_ACCESS_CODE) $("#accessWrap").hidden = false; else $("#accessCode").required = false;
  if (!LIVE) $("#offlineBanner").hidden = false;
  loadStudent(form, ["name", "regNo", "phone", "email", "programme"]);
  linkRegNo(form.elements.regNo, $("#programme"));

  function renumber() {
    [...sups.children].forEach((row, i) => {
      row.querySelector(".n").textContent = "Supervisor " + (i + 1);
      row.querySelector("input").required = i === 0;
      row.querySelector("button").hidden = i === 0;
    });
    $("#addSup").hidden = sups.children.length >= MAX;
  }
  function addSup(value) {
    if (sups.children.length >= MAX) return;
    const row = document.createElement("div"); row.className = "sup";
    row.innerHTML = '<label><span class="n"></span><input class="supName" maxlength="80" placeholder="Full name and title"></label>' +
                    '<button type="button" aria-label="Remove this supervisor">Remove</button>';
    row.querySelector("input").value = value || "";
    row.querySelector("button").addEventListener("click", () => { row.remove(); renumber(); });
    sups.appendChild(row); renumber();
    return row.querySelector("input");
  }
  addSup();
  $("#addSup").addEventListener("click", () => { const i = addSup(); if (i) i.focus(); });
  const title = $("#title");
  title.addEventListener("input", () => $("#count").textContent = title.value.length + " / 250");

  function setStatus(msg, kind) { status.textContent = msg; status.className = "status " + (kind || ""); status.hidden = !msg; }

  form.addEventListener("submit", async ev => {
    ev.preventDefault();
    if (!form.reportValidity()) return;
    const fd = new FormData(form);
    const data = { action: "project" };
    ["name", "regNo", "phone", "email", "programme", "accessCode", "website"].forEach(k => data[k] = clean(fd.get(k)));
    data.regNo = normRegNo(data.regNo);
    data.title = clean(fd.get("title"));
    data.supervisors = [...document.querySelectorAll(".supName")].map(i => clean(i.value)).filter(Boolean);
    saveStudent({ name: data.name, regNo: data.regNo, phone: data.phone, email: data.email, programme: data.programme, projectTitle: data.title });
    if (!LIVE) { setStatus("This page is not connected to the Faculty register yet, so your project title was not saved.", "error"); return; }

    btn.disabled = true; $("#result").hidden = true;
    setStatus("Sending your project title to the Faculty…", "busy");
    try {
      const r = await post(data);
      setStatus("", "");
      $("#resultTitle").textContent = r.updated ? "Project title updated" : "Project title recorded";
      const rows = [["Student", data.name + " (" + data.regNo + ")"], ["Programme", data.programme + " · " + r.year],
                    ["Project title", r.title]].concat(r.supervisors.map((s, i) => ["Supervisor " + (i + 1), s]));
      $("#resultFacts").innerHTML = rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("");
      $("#result").hidden = false;
      $("#result").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      setStatus(err && err.fromServer ? err.message : "Could not reach the Faculty register. Please check your connection and try again.", "error");
    } finally {
      btn.disabled = false;
    }
  });
})();
