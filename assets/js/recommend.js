/* recommend.html */
(function () {
  "use strict";
  const { CFG, LIVE, fillProgrammes, linkYear, loadStudent, saveStudent, clean, post, normRegNo, linkRegNo, pdfReady, warmLetterTools, queueLetter, showQueued } = window.FEAS;
  const $ = s => document.querySelector(s);
  const form = $("#recForm"), btn = $("#submitBtn"), status = $("#status");

  fillProgrammes($("#programme"));
  linkYear($("#programme"), $("#year"));
  if (CFG.REQUIRE_ACCESS_CODE && LIVE) $("#accessWrap").hidden = false; else $("#accessCode").required = false;
  if (!LIVE) $("#specimenBanner").hidden = false;
  loadStudent(form, ["name", "regNo", "phone", "email", "gender", "programme", "year"]);
  linkRegNo(form.elements.regNo, $("#programme"));
  warmLetterTools(form);

  // "Addressed to" and the address only matter when an organisation is named.
  const org = $("#organisation");
  const toggleOrg = () => { $("#orgExtra").hidden = !org.value.trim(); };
  org.addEventListener("input", toggleOrg);
  toggleOrg();

  function setStatus(msg, kind) { status.textContent = msg; status.className = "status " + (kind || ""); status.hidden = !msg; }

  form.addEventListener("submit", async ev => {
    ev.preventDefault();
    if (!form.reportValidity()) return;
    const fd = new FormData(form);
    const data = { action: "recommend" };
    ["name", "phone", "email", "programme", "year", "gender", "purpose", "organisation", "attention", "accessCode", "website"]
      .forEach(k => data[k] = clean(fd.get(k)));
    data.regNo = normRegNo(fd.get("regNo"));
    data.email = data.email.toLowerCase();
    data.purpose = data.purpose.replace(/[.\s]+$/, "");
    data.address = String(fd.get("address") || "").split("\n").map(clean).filter(Boolean).slice(0, 3).join("\n");
    if (!data.organisation) { data.attention = ""; data.address = ""; }
    else if (!data.attention) data.attention = "The Selection Committee";
    saveStudent({ name: data.name, regNo: data.regNo, phone: data.phone, email: data.email, gender: data.gender, programme: data.programme, year: data.year });

    btn.disabled = true; $("#result").hidden = true;
    setStatus(LIVE ? "Recording your request with the Faculty…" : "Preparing a specimen letter…", "busy");
    try {
      const rec = LIVE ? FEAS.checkLetterReply(await post(data))
        : { ok: true, specimen: true, ref: "SPECIMEN", code: "XXXX-XXXX", issuedAt: new Date().toISOString(), letterNo: 1 };
      setStatus("Preparing your letter…", "busy");
      await pdfReady();
      const verifyUrl = new URL("verify.html?c=" + encodeURIComponent(rec.code), location.href).href;
      const letterDate = rec.delivery ? rec.delivery.sendAfter : rec.issuedAt;
      const pdfBytes = await window.buildLetter({ ...data, ...rec, issuedAt: letterDate, kind: "recommendation", verifyUrl, specimen: !!rec.specimen });
      const panel = $("#result");
      if (rec.delivery) {
        setStatus("Sending your request to the Dean’s office…", "busy");
        const q = await queueLetter(pdfBytes, rec.delivery);
        showQueued(panel, q);
        if (q.approval) {
          panel.querySelector(".result-title").textContent = "Your request is with the Dean’s office";
          panel.querySelector(".result-text").textContent =
            "Once the Dean’s office approves your letter, it will be emailed to " + q.maskedEmail + ". Allow at least one working day.";
          panel.querySelector(".spam-note").textContent = "Watch your Spam or Junk folder as well as your inbox. If the letter is there, open it and mark it " +
            "“Not spam”. No letter after two working days? Contact the Dean’s office.";
        }
      } else {
        const url = URL.createObjectURL(new Blob([pdfBytes], { type: "application/pdf" }));
        const fname = ("Recommendation_Letter_" + data.name + "_" + (rec.ref || "")).replace(/[^\w\- ]+/g, "").replace(/\s+/g, "_").slice(0, 90) + ".pdf";
        const a = $("#downloadLink"); a.href = url; a.download = fname; a.hidden = false;
        a.click();
        $("#resultTitle").textContent = rec.specimen ? "Specimen letter downloaded" : "Your letter is ready";
        panel.querySelector(".result-text").textContent = "";
        panel.querySelector(".spam-note").hidden = true;
      }
      setStatus("", "");
      $("#resultRef").textContent = rec.specimen ? "Not recorded — the site is not connected to the Faculty register yet."
        : `Reference ${rec.ref}, verification code ${rec.code}. This is recommendation letter ${rec.letterNo} for you.`;
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
    ["purpose", "organisation", "attention", "address"].forEach(k => form.elements[k].value = "");
    toggleOrg();
    $("#result").hidden = true;
    form.elements.purpose.focus();
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  });
})();
