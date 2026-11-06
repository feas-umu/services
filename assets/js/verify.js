/* verify.html */
(function () {
  const API = window.LETTER_CONFIG.API_URL;
  const $ = s => document.querySelector(s);
  const out = $("#out"), st = $("#status");
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = iso => { const d = new Date(iso); return isNaN(d) ? iso : d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }); };

  async function check(code) {
    code = code.trim().toUpperCase();
    if (!code) return;
    out.hidden = true; st.hidden = false; st.className = "status busy"; st.textContent = "Checking the Faculty register…";
    try {
      if (!API || /^PASTE/.test(API)) throw new Error("This verification page is not connected to the Faculty register yet.");
      const res = await fetch(API + "?action=verify&code=" + encodeURIComponent(code));
      const r = await res.json();
      st.hidden = true;
      if (r.ok && r.found) {
        const details = r.kind === "intro"
          ? `<dt>Letter</dt><dd>Final-year project introductory letter</dd><dt>Project title</dt><dd>${esc(r.title)}</dd>`
          : r.kind === "recommendation"
          ? `<dt>Letter</dt><dd>Recommendation letter</dd><dt>Applying for</dt><dd>${esc(r.purpose)}${r.organisation ? " at " + esc(r.organisation) : ""}</dd>`
          : `<dt>Letter</dt><dd>Industrial training placement letter</dd><dt>Addressed to</dt><dd>${esc(r.company)}</dd>`;
        const verdict = r.state === "withdrawn"
          ? `<div class="verdict bad"><div class="mark">!</div><div><h2>Withdrawn by the Faculty</h2><p style="margin:0">This letter was withdrawn and is <strong>not valid</strong>. Please contact the Dean’s office.</p></div></div>`
          : r.state === "pending"
          ? `<div class="verdict wait"><div class="mark">…</div><div><h2>Not yet approved</h2><p style="margin:0">This letter is in the Faculty register but has <strong>not been approved yet</strong>, so it is not valid at the moment.</p></div></div>`
          : `<div class="verdict ok"><div class="mark">✓</div><div><h2>Issued by the Faculty</h2><p style="margin:0">Now compare: every detail printed on the letter must match the record below. If anything differs, the letter has been altered and is not valid.</p></div></div>`;
        out.innerHTML = verdict + `
          <dl class="facts">
            <dt>Student</dt><dd>${esc(r.name)}</dd>
            <dt>Registration No.</dt><dd>${esc(r.regNo)}</dd>
            <dt>Programme</dt><dd>${esc(r.programme)}${r.year ? ", " + esc(r.year) : ""}</dd>
            ${details}
            <dt>Reference</dt><dd>${esc(r.ref)}</dd>
            <dt>Requested</dt><dd>${esc(fmt(r.issued))}</dd>
          </dl>`;
      } else {
        out.innerHTML = `<div class="verdict bad"><div class="mark">!</div><div>
          <h2>Not found</h2><p style="margin:0">No letter with code <strong>${esc(code)}</strong> is in the Faculty register. Check the code, or contact the Dean’s office.</p></div></div>`;
      }
      out.hidden = false;
    } catch (e) {
      st.className = "status error"; st.textContent = e.message || "Could not reach the Faculty register. Please try again.";
    }
  }
  $("#vform").addEventListener("submit", e => { e.preventDefault(); check($("#code").value); });
  const c = new URLSearchParams(location.search).get("c");
  if (c) { $("#code").value = c; check(c); }
})();
