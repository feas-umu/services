/* accept.html */
(function () {
  "use strict";
  const { normRegNo, linkRegNo, CFG, LIVE, fillProgrammes, linkYear, loadStudent, saveStudent, clean, post } = window.FEAS;
  const $ = s => document.querySelector(s);
  const form = $("#acceptForm"), btn = $("#submitBtn"), status = $("#status");
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  fillProgrammes($("#programme"));
  linkYear($("#programme"), $("#year"));
  if (CFG.REQUIRE_ACCESS_CODE) $("#accessWrap").hidden = false; else $("#accessCode").required = false;
  if (!LIVE) $("#offlineBanner").hidden = false;
  loadStudent(form, ["name", "regNo", "phone", "email", "programme", "year"]);
  linkRegNo(form.elements.regNo, $("#programme"));
  try {   // suggest companies this student made letters for on this device
    (FEAS.readSaved().companies || []).forEach(c => {
      const o = document.createElement("option"); o.value = c; $("#myCompanies").appendChild(o);
    });
  } catch (e) {}

  function setStatus(msg, kind) { status.textContent = msg; status.className = "status " + (kind || ""); status.hidden = !msg; }

  /* ---------- distance from the town/centre: a number from 0 to DISTANCE_MAX_KM ---------- */
  const MAX_KM = Number(CFG.DISTANCE_MAX_KM) || 50;
  const km = $("#distance");
  km.max = String(MAX_KM); $("#kmMax").textContent = MAX_KM;
  function checkKm() {
    const t = km.value.trim(), n = Number(t);
    km.setCustomValidity(km.validity.badInput || t === "" || !isFinite(n) || n < 0 || n > MAX_KM
      ? "Enter the distance in km as a number from 0 to " + MAX_KM + " (0 if the workplace is in the town itself)." : "");
  }
  km.addEventListener("input", checkKm);
  km.addEventListener("wheel", () => km.blur(), { passive: true });   // stop the mouse wheel changing the number
  // Keep only digits and one decimal point (type=number already blocks letters in most browsers).
  km.addEventListener("keydown", e => { if (["e", "E", "+", "-"].includes(e.key)) e.preventDefault(); });

  /* ---------- transport fare (UGX, one way): whole shillings from 0 to FARE_MAX_UGX ---------- */
  const MAX_FARE = Number(CFG.FARE_MAX_UGX) || 100000;
  const fare = $("#fare");
  const ugx = n => n.toLocaleString("en-US");                         // 5000 → "5,000"
  function checkFare() {
    const t = fare.value.replace(/[,\s]/g, "");
    fare.setCustomValidity(
      t.includes(".") ? "Whole shillings only: remove the decimal point (e.g. 5,000, not 5,000.50)." :
      !/^\d{1,7}$/.test(t) || Number(t) > MAX_FARE ? "Enter the one-way fare in UGX as a whole number from 0 to " + ugx(MAX_FARE) + " (0 if you will walk)." : "");
  }
  // Digits only, shown with thousands separators as the student types. A "." is kept so the
  // student sees it and is asked to remove it, rather than "500.75" silently becoming 50,075.
  fare.addEventListener("input", () => {
    const [whole, ...rest] = fare.value.split(".");
    const d = whole.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 7);
    fare.value = (d ? ugx(Number(d)) : "") + (rest.length ? "." + rest.join("").replace(/\D/g, "") : "");
    checkFare();
  });

  /* ---------- acceptance letter: upload, or promise to bring it ---------- */
  const MAX_MB = 5;
  const fileInput = $("#letterFile"), promise = $("#promise");
  let letter = null;                               // { name, data (base64), size }
  const readAsBase64 = blob => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).replace(/^data:[^,]+,/, ""));
    r.onerror = () => rej(new Error("The file could not be read."));
    r.readAsDataURL(blob);
  });
  // Phone photos are often 4–10 MB: shrink them to a clear, readable JPEG before upload.
  async function shrinkImage(file) {
    const img = new Image();
    img.src = URL.createObjectURL(file);
    await img.decode();
    const k = Math.min(1, 2200 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(img.src);
    return new Promise(res => c.toBlob(res, "image/jpeg", 0.85));
  }
  function syncLetter() {
    $("#fileChosen").hidden = !letter;
    $("#promiseWrap").hidden = !!letter;
    if (letter) { promise.checked = false; $("#fileName").textContent = "✓ " + letter.name + " (" + (letter.size / 1048576).toFixed(1) + " MB)"; }
    promise.setCustomValidity(letter || promise.checked ? "" :
      "Upload your acceptance letter above, or tick this box to confirm you will bring it to the Dean’s office.");
  }
  fileInput.addEventListener("change", async () => {
    const f = fileInput.files && fileInput.files[0];
    letter = null; syncLetter();
    if (!f) return;
    try {
      const isPdf = f.type === "application/pdf" || /\.pdf$/i.test(f.name);
      const isImg = /^image\//.test(f.type);
      if (!isPdf && !isImg) throw new Error("Please choose a PDF, JPG or PNG file.");
      let blob = f, name = f.name;
      if (isImg && (f.size > 1.2 * 1048576 || f.type !== "image/png" && f.type !== "image/jpeg")) {
        setStatus("Preparing your photo…", "busy");
        blob = await shrinkImage(f); name = name.replace(/\.[^.]+$/, "") + ".jpg";
      }
      if (blob.size > MAX_MB * 1048576) throw new Error("This file is larger than " + MAX_MB + " MB. Please choose a smaller file, or take a photo instead.");
      letter = { name, size: blob.size, data: await readAsBase64(blob) };
      setStatus("", "");
    } catch (e) {
      fileInput.value = ""; letter = null;
      setStatus(e.message || "The file could not be used.", "error");
    }
    syncLetter();
  });
  $("#fileClear").addEventListener("click", () => { fileInput.value = ""; letter = null; syncLetter(); fileInput.focus(); });
  promise.addEventListener("change", syncLetter);
  syncLetter();

  form.addEventListener("submit", async ev => {
    ev.preventDefault();
    syncLetter(); checkKm(); checkFare();
    if (!form.reportValidity()) return;
    const fd = new FormData(form);
    const data = { action: "confirm" };
    ["name", "regNo", "phone", "email", "programme", "year", "company", "supervisor", "supervisorPhone", "town", "district", "distance", "fare", "accessCode", "website"]
      .forEach(k => data[k] = clean(fd.get(k)));
    data.regNo = normRegNo(data.regNo);
    data.fare = data.fare.replace(/[,\s]/g, "");
    if (letter) data.letter = { name: letter.name, data: letter.data }; else data.promise = promise.checked === true;
    saveStudent({ name: data.name, regNo: data.regNo, phone: data.phone, email: data.email, programme: data.programme, year: data.year });
    if (!LIVE) { setStatus("This page is not connected to the Faculty register yet, so your placement was not saved.", "error"); return; }

    btn.disabled = true; $("#result").hidden = true;
    setStatus(letter ? "Sending your placement and acceptance letter to the Faculty…" : "Sending your placement to the Faculty…", "busy");
    try {
      const r = await post(data);
      setStatus("", "");
      $("#resultTitle").textContent = r.updated ? "Placement updated" : "Placement recorded";
      $("#resultText").textContent = "Thank you. The Faculty now has these details:";
      const rows = [["Student", data.name + " (" + data.regNo + ")"], ["Course", data.programme + " · " + r.year],
                    ["Company", data.company], ["Supervisor", data.supervisor + " · " + (r.phone || data.supervisorPhone)],
                    ["Location", r.town + ", " + r.district + " District"],
                    ["Distance from " + r.town, (r.distance === 0 ? "0 km (in the town)" : r.distance + " km")],
                    ["Transport fare (one way)", r.fare === 0 ? "None (walking)" : "UGX " + ugx(r.fare)], ["Placement letter", r.letterRef],
                    ["Acceptance letter", r.acceptance === "Uploaded" ? "Uploaded" : r.acceptance === "Received at office" ? "Received at the office" : "To bring to the Dean’s office"]];
      $("#resultFacts").innerHTML = rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("");
      const rem = $("#reminder");
      rem.hidden = r.acceptance !== "Will bring to office";
      rem.textContent = "Remember: bring your acceptance letter from " + data.company + " to the Dean’s office before your internship starts. " +
                        "If you get a copy sooner, come back to this page and submit the form again with the file.";
      if (letter) { fileInput.value = ""; letter = null; syncLetter(); }
      $("#result").hidden = false;
      $("#result").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      setStatus(err && err.fromServer ? err.message : "Could not reach the Faculty register. Please check your connection and try again.", "error");
    } finally {
      btn.disabled = false;
    }
  });
})();
