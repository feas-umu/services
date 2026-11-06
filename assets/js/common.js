/* Helpers shared by the student pages. */
(function () {
  "use strict";
  const CFG = window.LETTER_CONFIG;
  const KEY = "feas-student";
  const LIVE = !!CFG.API_URL && !/^PASTE/.test(CFG.API_URL);

  function fillProgrammes(sel) {
    const groups = {};
    CFG.PROGRAMMES.forEach(p => {
      if (!groups[p.group]) { groups[p.group] = document.createElement("optgroup"); groups[p.group].label = p.group; sel.appendChild(groups[p.group]); }
      const o = document.createElement("option"); o.value = p.name; o.textContent = p.label || p.name; groups[p.group].appendChild(o);
    });
  }

  // Year of study options follow the chosen programme (e.g. 3 years for diplomas, 4 for degrees).
  function linkYear(progSel, yearSel) {
    function refresh() {
      const p = CFG.PROGRAMMES.find(x => x.name === progSel.value);
      const keep = yearSel.value;
      yearSel.innerHTML = '<option value="" disabled selected>' + (p ? "Choose your year" : "Choose your programme first") + "</option>";
      yearSel.disabled = !p;
      if (!p) return;
      for (let y = 1; y <= p.years; y++) {
        const o = document.createElement("option"); o.value = String(y); o.textContent = "Year " + y; yearSel.appendChild(o);
      }
      if (keep && +keep <= p.years) yearSel.value = keep;
    }
    progSel.addEventListener("change", refresh);
    refresh();
    return refresh;
  }

  /* ---------- what this device remembers ----------
     By default details last only while this browser tab is open (sessionStorage), so the next
     person on a shared or café computer doesn't see them. "Remember me" keeps them (localStorage). */
  const REM = "feas-remember", TOK = "feas-token";
  const safe = fn => { try { return fn(); } catch (e) { return null; } };
  const remembered = () => safe(() => localStorage.getItem(REM) === "1") === true;
  const store = () => safe(() => (remembered() ? localStorage : sessionStorage));
  function readSaved() { return safe(() => JSON.parse(store().getItem(KEY) || "{}")) || {}; }
  function saveStudent(obj) {
    safe(() => store().setItem(KEY, JSON.stringify(Object.assign(readSaved(), obj))));
  }
  function loadStudent(form, fields) {
    const saved = readSaved();
    fields.forEach(k => {
      if (!saved[k] || !form.elements[k]) return;
      form.elements[k].value = saved[k];
      form.elements[k].dispatchEvent(new Event("change"));
    });
  }
  function setRemember(on) {
    safe(() => {
      const from = on ? sessionStorage : localStorage, to = on ? localStorage : sessionStorage;
      [KEY, TOK].forEach(k => { const v = from.getItem(k); if (v != null) to.setItem(k, v); from.removeItem(k); });
      if (on) localStorage.setItem(REM, "1"); else localStorage.removeItem(REM);
    });
  }
  function forgetAll() {
    safe(() => [KEY, TOK, REM, "feas-companies"].forEach(k => { localStorage.removeItem(k); sessionStorage.removeItem(k); }));
  }
  // Wires the "Remember my details" box and the "Not you?" link that every student form has.
  function setupRemember(form, fields) {
    const box = form.querySelector('input[name="remember"]'), forget = form.querySelector(".forget");
    if (!box) return;
    box.checked = remembered();
    box.addEventListener("change", () => setRemember(box.checked));
    if (forget) {
      forget.hidden = !readSaved().regNo;
      forget.addEventListener("click", () => {
        forgetAll();
        fields.concat(["title"]).forEach(k => { const el = form.elements[k]; if (el) { el.value = ""; el.dispatchEvent(new Event("change")); } });
        box.checked = false; forget.hidden = true;
        form.elements.name && form.elements.name.focus();
      });
    }
  }

  /* ---------- device pass (proves this device verified the student's email) ---------- */
  const tokenFor = regNo => { const t = safe(() => JSON.parse(store().getItem(TOK) || "{}")) || {}; return t[regNo] || ""; };
  const keepToken = (regNo, token) => safe(() => {
    const t = JSON.parse(store().getItem(TOK) || "{}"); t[regNo] = token; store().setItem(TOK, JSON.stringify(t));
  });

  const clean = s => String(s || "").replace(/\s+/g, " ").trim();

  // Registration numbers: 2022-B472-92991 (Bachelor's) or 2023-D131-93058 (Diploma).
  const normRegNo = s => clean(s).toUpperCase().replace(/[\s\/_.]+/g, "-").replace(/-+/g, "-");
  const levelOf = programme => (/^Diploma/.test(programme || "") ? "Diploma" : "Bachelor");
  function regNoError(regNo, programme) {
    const R = CFG.REGNO, r = normRegNo(regNo);
    if (!r) return "";
    if (!programme) return new RegExp(R.Diploma.pattern).test(r) || new RegExp(R.Bachelor.pattern).test(r)
      ? "" : "Use the format " + R.Bachelor.example + " (Bachelor's) or " + R.Diploma.example + " (Diploma).";
    const lv = levelOf(programme), other = lv === "Diploma" ? "Bachelor" : "Diploma";
    if (new RegExp(R[lv].pattern).test(r)) return "";
    if (new RegExp(R[other].pattern).test(r)) return "This is a " + (other === "Diploma" ? "Diploma" : "Bachelor's") + " registration number, but you chose a " + (lv === "Diploma" ? "Diploma" : "Bachelor's") + " programme.";
    return "Use the format " + R[lv].example + ".";
  }
  // Live check on the registration number box; tidies the value when the student leaves it.
  function linkRegNo(input, progSel) {
    const check = () => input.setCustomValidity(regNoError(input.value, progSel.value));
    input.addEventListener("input", check);
    input.addEventListener("blur", () => { input.value = normRegNo(input.value); check(); });
    progSel.addEventListener("change", check);
    check();
  }

  async function send(data) {
    const res = await fetch(CFG.API_URL, { method: "POST", body: JSON.stringify(data) });
    return res.json();
  }
  // Sends a request to the register. If the register asks for the code it emailed, shows a code box
  // in the form and resends with the code. Stores the device pass it returns.
  async function post(data) {
    if (data.regNo && !data.token) data.token = tokenFor(data.regNo);
    await robotCheck(data);
    let r = await send(data);
    if (r.needsCode) r = await askForCode(data, r);
    resetRobot();
    if (!r.ok) { const e = new Error(r.error || "The Faculty server did not accept the request."); e.fromServer = true; throw e; }
    if (r.token && data.regNo) keepToken(data.regNo, r.token);
    return r;
  }

  function askForCode(data, first) {
    const form = document.querySelector("main form"), anchor = form.querySelector("#status") || form.lastElementChild;
    const box = document.createElement("div");
    box.className = "otp";
    box.setAttribute("role", "group");
    box.innerHTML = '<h3>Check your email</h3><p class="otp-msg"></p>' +
      '<div class="row"><input class="otp-input" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6-digit code" aria-label="6-digit code">' +
      '<button type="button" class="otp-go">Continue</button></div>' +
      '<p class="otp-links"><button type="button" class="linkish otp-new">Send a new code</button><button type="button" class="linkish otp-cancel">Cancel</button></p>';
    anchor.parentNode.insertBefore(box, anchor);
    const msg = box.querySelector(".otp-msg"), input = box.querySelector("input"), go = box.querySelector(".otp-go");
    const say = (t, bad) => { msg.textContent = t; msg.classList.toggle("bad", !!bad); };
    say(first.error);
    const st = form.querySelector("#status");
    if (st) { st.textContent = "Waiting for the code from your email…"; st.className = "status busy"; st.hidden = false; }
    input.focus();
    return new Promise((resolve) => {
      const finish = r => { box.remove(); resolve(r); };
      async function attempt(extra) {
        go.disabled = true;
        try {
          await robotCheck(data);
          const r = await send(Object.assign({}, data, extra));
          if (r.needsCode) { say(r.error, !!extra.otp); input.value = ""; input.focus(); }
          else finish(r);
        } catch (e) { say("Could not reach the Faculty register. Check your connection and try again.", true); }
        finally { go.disabled = false; resetRobot(); }
      }
      go.addEventListener("click", () => {
        const code = input.value.replace(/\D/g, "");
        if (code.length !== 6) { say("Enter the 6 digits from the email.", true); input.focus(); return; }
        attempt({ otp: code });
      });
      input.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); go.click(); } });
      box.querySelector(".otp-new").addEventListener("click", () => attempt({}));
      box.querySelector(".otp-cancel").addEventListener("click", () => finish({ ok: false, error: "Cancelled. Nothing was saved." }));
    });
  }

  /* ---------- optional "I am not a robot" check (Cloudflare Turnstile) ---------- */
  let robotWidget = null;
  function robotCheck(data) {
    if (!CFG.TURNSTILE_SITE_KEY || robotWidget === null || !window.turnstile) return Promise.resolve();
    const t = window.turnstile.getResponse(robotWidget);
    if (!t) { const e = new Error("Please complete the “I am not a robot” check first."); e.fromServer = true; return Promise.reject(e); }
    data.cf = t;
    return Promise.resolve();
  }
  function resetRobot() { if (robotWidget !== null && window.turnstile) window.turnstile.reset(robotWidget); }
  function setupRobot(form) {
    if (!CFG.TURNSTILE_SITE_KEY || !form) return;
    const slot = document.createElement("div");
    slot.className = "robot";
    form.insertBefore(slot, form.querySelector('button[type="submit"]'));
    window.onTurnstileLoad = () => { robotWidget = window.turnstile.render(slot, { sitekey: CFG.TURNSTILE_SITE_KEY }); };
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTurnstileLoad";
    s.async = true;
    document.head.appendChild(s);
  }

  // Heavy libraries load only when they are needed, so pages open quickly on mobile data.
  // Scripts added with async = false download in parallel but run in order.
  const loading = {};
  function loadScripts(list) {
    const key = list.join("|");
    if (!loading[key]) {
      loading[key] = Promise.all(list.map(src => new Promise((res, rej) => {
        const s = document.createElement("script");
        s.src = src; s.async = false; s.onload = res;
        s.onerror = () => { delete loading[key]; rej(new Error("Could not load " + src)); };
        document.head.appendChild(s);
      })));
    }
    return loading[key];
  }
  const pdfReady = () => loadScripts(["assets/vendor/pdf-lib.min.js", "assets/vendor/fontkit.umd.min.js",
                                      "assets/vendor/qrcode.js", "assets/js/letter.js"]);
  const excelReady = () => loadScripts(["assets/vendor/exceljs.min.js"]);
  // Start fetching the letter tools as soon as a student begins typing.
  function warmLetterTools(form) {
    form.addEventListener("focusin", () => {
      pdfReady().catch(() => {});
      ["assets/fonts/Carlito-Regular.ttf", "assets/fonts/Carlito-Bold.ttf", "assets/img/header.png", "assets/img/crest_wm.png"]
        .forEach(u => fetch(u).catch(() => {}));
    }, { once: true });
  }

  // Keep the current page's tab visible in the scrollable tab row.
  const tabs = document.querySelector(".tabs"), cur = tabs && tabs.querySelector('[aria-current="page"]');
  if (cur && cur.offsetLeft + cur.offsetWidth > tabs.clientWidth) tabs.scrollLeft = cur.offsetLeft - 16;

  /* ---------- contact links ----------
     The Dean's email and phone are not written in the pages, so address-harvesting bots can't
     collect them. A click decodes the link, opens the email or phone app, and shows the address
     or number in the link so people without a mail app can copy it. */
  document.querySelectorAll("a.reveal[data-v]").forEach(a => {
    a.addEventListener("click", () => {
      const v = safe(() => atob(a.dataset.v).split("").reverse().join(""));
      if (!v) return;
      a.href = a.dataset.k + ":" + v;
      const label = a.querySelector("span");
      if (label) label.textContent = a.dataset.k === "tel" ? v.replace(/^\+256(\d{3})(\d{6})$/, "0$1 $2") : v;
      a.classList.add("revealed");
    });
  });

  /* ---------- emailed letters ----------
     The register returns a signed ticket with each new letter. The PDF built here is uploaded with it;
     the register queues it and emails it to the student after SEND_DELAY_MINUTES (Code.gs). */
  function toBase64(bytes) {
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  // A letter reply must carry the record the register made. Anything else (for example a redirected
  // request that reached the register's status page) is refused before any letter is drawn.
  function checkLetterReply(rec) {
    if (!rec || rec.specimen) return rec;
    const fail = m => { const e = new Error(m); e.fromServer = true; throw e; };
    if (rec.service) fail("The website reached the Faculty register, but your request did not. Nothing was issued. " +
      "(Staff: check that API_URL in config.js is exactly the Web app URL, starting https://script.google.com/macros/s/ and ending /exec.)");
    if (!rec.ref || !rec.code || !rec.signature || !rec.stamp)
      fail("The Faculty register’s reply was incomplete, so no letter was made. Please try again; if it keeps happening, contact the Dean’s office.");
    return rec;
  }

  async function queueLetter(pdfBytes, delivery) {
    const r = await send({ action: "deliver", ticket: delivery.ticket, pdf: toBase64(pdfBytes) });
    if (!r.ok) { const e = new Error(r.error || "Your letter could not be queued. Please try again."); e.fromServer = true; throw e; }
    return r;
  }
  // "between 10:35 and 10:45 today" (or "tomorrow", or a date).
  function arrivalText(iso) {
    const a = new Date(iso), b = new Date(a.getTime() + 10 * 60000), now = new Date();
    const t = d => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    const day = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };
    const diff = Math.round((day(a) - day(now)) / 864e5);
    const when = diff === 0 ? "today" : diff === 1 ? "tomorrow" : "on " + a.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
    return "between " + t(a) + " and " + t(b) + " " + when;
  }
  // Fills the result panel for an emailed letter, including the spam reminder.
  function showQueued(panel, q) {
    panel.querySelector(".result-title").textContent = "Your letter is on its way";
    panel.querySelector(".result-text").textContent =
      "We will email it to " + q.maskedEmail + " " + arrivalText(q.sendAfter) + ".";
    const spam = panel.querySelector(".spam-note");
    spam.hidden = false;
    spam.textContent = "Not in your inbox by then? Check your Spam or Junk folder. If it is there, open it and mark it “Not spam” " +
                       "so future letters reach your inbox. Still nothing after 30 minutes more? Contact the Dean’s office.";
    const dl = panel.querySelector(".download"); if (dl) dl.hidden = true;
  }

  // Every student form gets the remember box and (if configured) the robot check.
  const studentForm = document.querySelector("main form[data-student]");
  if (studentForm) {
    setupRemember(studentForm, ["name", "regNo", "phone", "email", "gender", "programme", "year"]);
    setupRobot(studentForm);
  }

  window.FEAS = { CFG, LIVE, fillProgrammes, linkYear, loadStudent, saveStudent, readSaved, clean, post, normRegNo, linkRegNo,
                  pdfReady, excelReady, warmLetterTools, queueLetter, showQueued, checkLetterReply };
})();
