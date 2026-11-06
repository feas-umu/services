(function () {
  "use strict";
  const { CFG, LIVE, fillProgrammes, linkYear, loadStudent, saveStudent, clean, post, normRegNo, linkRegNo, pdfReady, warmLetterTools, queueLetter, showQueued } = window.FEAS;
  const $ = s => document.querySelector(s);
  const form = $("#letterForm"), btn = $("#submitBtn"), status = $("#status");

  fillProgrammes($("#programme"));
  linkYear($("#programme"), $("#year"));
  $("#attention").value = CFG.LETTER.defaultAttention;
  if (CFG.REQUIRE_ACCESS_CODE && LIVE) $("#accessWrap").hidden = false; else $("#accessCode").required = false;
  if (!LIVE) $("#specimenBanner").hidden = false;
  loadStudent(form, ["name", "regNo", "phone", "email", "programme", "year", "gender"]);
  linkRegNo(form.elements.regNo, $("#programme"));

  function setStatus(msg, kind) { status.textContent = msg; status.className = "status " + (kind || ""); status.hidden = !msg; }

  form.addEventListener("submit", async ev => {
    ev.preventDefault();
    if (!form.reportValidity()) return;
    const fd = new FormData(form);
    const data = {
      action: "issue",
      name: clean(fd.get("name")),
      regNo: normRegNo(fd.get("regNo")),
      phone: clean(fd.get("phone")),
      email: clean(fd.get("email")).toLowerCase(),
      programme: fd.get("programme"),
      year: fd.get("year"),
      gender: fd.get("gender"),
      company: clean(fd.get("company")),
      attention: clean(fd.get("attention")) || CFG.LETTER.defaultAttention,
      address: String(fd.get("address") || "").split("\n").map(clean).filter(Boolean).slice(0, 3).join("\n"),
      accessCode: clean(fd.get("accessCode")),
      website: fd.get("website") || ""          // honeypot: humans leave this empty
    };
    saveStudent({ name: data.name, regNo: data.regNo, phone: data.phone, email: data.email, programme: data.programme, year: data.year, gender: data.gender });

    btn.disabled = true; $("#result").hidden = true;
    setStatus(LIVE ? "Recording your request with the Faculty…" : "Preparing a specimen letter…", "busy");
    try {
      const rec = LIVE ? FEAS.checkLetterReply(await post(data))
        : { ok: true, specimen: true, ref: "SPECIMEN", code: "XXXX-XXXX", issuedAt: new Date().toISOString(), letterNo: 1, companies: [data.company] };
      setStatus("Preparing your letter…", "busy");
      await pdfReady();
      const verifyUrl = new URL("verify.html?c=" + encodeURIComponent(rec.code), location.href).href;
      // An emailed letter is dated with the day it is sent.
      const letterDate = rec.delivery ? rec.delivery.sendAfter : rec.issuedAt;
      const pdfBytes = await window.buildLetter({ ...data, ...rec, issuedAt: letterDate, verifyUrl, specimen: !!rec.specimen });
      const panel = $("#result");
      if (rec.delivery) {
        setStatus("Sending your letter to the Faculty outbox…", "busy");
        showQueued(panel, await queueLetter(pdfBytes, rec.delivery));
      } else {
        const url = URL.createObjectURL(new Blob([pdfBytes], { type: "application/pdf" }));
        const fname = ("Placement_Letter_" + data.name + "_" + data.company).replace(/[^\w\- ]+/g, "").replace(/\s+/g, "_").slice(0, 90) + ".pdf";
        const a = $("#downloadLink"); a.href = url; a.download = fname; a.hidden = false;
        a.click();
        $("#resultTitle").textContent = rec.specimen ? "Specimen letter downloaded" : "Your letter is ready";
        panel.querySelector(".result-text").textContent = "";
        panel.querySelector(".spam-note").hidden = true;
      }
      setStatus("", "");
      $("#resultRef").textContent = rec.specimen ? "Not recorded — the site is not connected to the Faculty register yet."
        : `Reference ${rec.ref}, verification code ${rec.code}.` + (rec.repeat ? " You had already asked for a letter to this company, so it keeps the same reference." : "");
      saveStudent({ companies: rec.companies || [] });
      const list = $("#companyList"); list.innerHTML = "";
      (rec.companies || []).forEach(c => { const li = document.createElement("li"); li.textContent = c; list.appendChild(li); });
      $("#companyCount").textContent = (rec.companies || []).length;
      $("#result").hidden = false;
      $("#result").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      console.error(err);
      setStatus(err && err.fromServer ? err.message : "Something went wrong while making your letter. Please check your connection and try again.", "error");
    } finally {
      btn.disabled = false;
    }
  });

  $("#anotherBtn").addEventListener("click", () => {
    ["company", "address"].forEach(k => form.elements[k].value = "");
    $("#attention").value = CFG.LETTER.defaultAttention;
    $("#result").hidden = true;
    form.elements.company.focus();
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  warmLetterTools(form);
})();
