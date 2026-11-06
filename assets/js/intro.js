/* intro.html */
(function () {
  "use strict";
  const { CFG, LIVE, fillProgrammes, linkYear, loadStudent, saveStudent, clean, post, normRegNo, linkRegNo, pdfReady, warmLetterTools, queueLetter, showQueued } = window.FEAS;
  const $ = s => document.querySelector(s);
  const form = $("#introForm"), btn = $("#submitBtn"), status = $("#status");

  fillProgrammes($("#programme"));
  linkYear($("#programme"), $("#year"));
  if (CFG.REQUIRE_ACCESS_CODE && LIVE) $("#accessWrap").hidden = false; else $("#accessCode").required = false;
  if (!LIVE) $("#specimenBanner").hidden = false;
  loadStudent(form, ["name", "regNo", "phone", "email", "gender", "programme"]);
  linkRegNo(form.elements.regNo, $("#programme"));
  warmLetterTools(form);
  // Final-year students: pre-select the last year of the chosen programme.
  function finalYear() {
    const p = CFG.PROGRAMMES.find(x => x.name === $("#programme").value);
    if (p && !$("#year").value) $("#year").value = String(p.years);
  }
  $("#programme").addEventListener("change", finalYear);
  finalYear();
  const savedTitle = FEAS.readSaved().projectTitle; if (savedTitle) $("#title").value = savedTitle;

  function setStatus(msg, kind) { status.textContent = msg; status.className = "status " + (kind || ""); status.hidden = !msg; }

  form.addEventListener("submit", async ev => {
    ev.preventDefault();
    if (!form.reportValidity()) return;
    const fd = new FormData(form);
    const data = { action: "intro" };
    ["name", "phone", "email", "programme", "year", "gender", "accessCode", "website"].forEach(k => data[k] = clean(fd.get(k)));
    data.regNo = normRegNo(fd.get("regNo"));
    data.title = clean(fd.get("title"));
    saveStudent({ name: data.name, regNo: data.regNo, phone: data.phone, email: data.email, gender: data.gender, programme: data.programme, projectTitle: data.title });

    btn.disabled = true; $("#result").hidden = true;
    setStatus(LIVE ? "Checking your project with the Faculty register…" : "Preparing a specimen letter…", "busy");
    try {
      const rec = LIVE ? FEAS.checkLetterReply(await post(data))
        : { ok: true, specimen: true, ref: "SPECIMEN", code: "XXXX-XXXX", issuedAt: new Date().toISOString(), letterNo: 1, title: data.title };
      setStatus("Preparing your letter…", "busy");
      await pdfReady();
      const verifyUrl = new URL("verify.html?c=" + encodeURIComponent(rec.code), location.href).href;
      const letterDate = rec.delivery ? rec.delivery.sendAfter : rec.issuedAt;     // emailed letters carry the sending date
      const pdfBytes = await window.buildLetter({ ...data, ...rec, issuedAt: letterDate, kind: "intro", verifyUrl, specimen: !!rec.specimen });
      const panel = $("#result");
      if (rec.delivery) {
        setStatus("Sending your letter to the Faculty outbox…", "busy");
        showQueued(panel, await queueLetter(pdfBytes, rec.delivery));
      } else {
        const url = URL.createObjectURL(new Blob([pdfBytes], { type: "application/pdf" }));
        const fname = ("Project_Introductory_Letter_" + data.name + "_" + (rec.ref || "")).replace(/[^\w\- ]+/g, "").replace(/\s+/g, "_").slice(0, 90) + ".pdf";
        const a = $("#downloadLink"); a.href = url; a.download = fname; a.hidden = false;
        a.click();
        $("#resultTitle").textContent = rec.specimen ? "Specimen letter downloaded" : "Your letter is ready";
        panel.querySelector(".result-text").textContent = "";
        panel.querySelector(".spam-note").hidden = true;
      }
      setStatus("", "");
      $("#resultRef").textContent = rec.specimen ? "Not recorded — the site is not connected to the Faculty register yet."
        : `Reference ${rec.ref}, verification code ${rec.code}. This is introductory letter ${rec.letterNo} for you.`;
      $("#result").hidden = false;
      $("#result").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      console.error(err);
      setStatus(err && err.fromServer ? err.message : "Something went wrong while making your letter. Please check your connection and try again.", "error");
    } finally {
      btn.disabled = false;
    }
  });
  $("#anotherBtn").addEventListener("click", () => { $("#result").hidden = true; form.scrollIntoView({ behavior: "smooth", block: "start" }); });
})();
