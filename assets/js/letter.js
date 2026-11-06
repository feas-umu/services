/* Builds the placement letter PDF in the browser with pdf-lib.
   Layout measurements are taken from the Faculty's original Word letter (A4). */
(function () {
  "use strict";
  const { PDFDocument, rgb, degrees, pushGraphicsState, popGraphicsState,
          concatTransformationMatrix } = PDFLib;

  const W = 595.32, H = 841.92;
  const ML = 72, MR = 523.5, TW = MR - ML;
  const SIZE = 11.04, ASC = 0.75;          // body size and ascent ratio (Calibri/Carlito)
  const BLACK = rgb(0, 0, 0);
  const LINK = rgb(0.0196, 0.388, 0.757);
  const STAMP_INK = rgb(0.90, 0.10, 0.40);
  const MONTHS = ["January","February","March","April","May","June","July",
                  "August","September","October","November","December"];
  const STAMP_MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

  const cache = {};
  async function bytes(url) {
    if (!cache[url]) {
      cache[url] = fetch(url).then(r => {
        if (!r.ok) throw new Error("Could not load " + url);
        return r.arrayBuffer();
      });
    }
    return new Uint8Array(await cache[url]);
  }
  function b64(data) {
    const s = atob(String(data).replace(/^data:[^,]+,/, ""));
    const u = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    return u;
  }
  function suffix(n) {
    const v = n % 100;
    if (v >= 11 && v <= 13) return "th";
    return ["th", "st", "nd", "rd"][n % 10] || "th";
  }

  /* ---------- reference-stamped signature and stamp ----------
     The letter's reference is printed as fine repeated text behind the ink, inside the image
     itself. Anyone who copies the signature or stamp out of a PDF copies that reference with it. */
  async function withRef(data, ref, oval) {
    if (!ref || typeof document === "undefined") return b64(data);
    const img = new Image();
    img.src = "data:image/png;base64," + String(data).replace(/^data:[^,]+,/, "");
    await img.decode();
    const k = Math.max(1, 600 / img.width), w = Math.round(img.width * k), h = Math.round(img.height * k);
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d");
    g.drawImage(img, 0, 0, w, h);
    g.save();
    g.globalCompositeOperation = "destination-over";        // behind the ink
    g.beginPath();
    g.ellipse(w / 2, h / 2, w * (oval ? 0.47 : 0.5), h * (oval ? 0.47 : 0.5), 0, 0, Math.PI * 2);   // soft edge, no box
    g.clip();
    g.translate(w / 2, h / 2); g.rotate(-0.21); g.translate(-w / 2, -h / 2);
    const fs = Math.round(w / 34), line = (ref + "   ").repeat(12);
    g.font = "600 " + fs + "px sans-serif";
    g.fillStyle = "rgba(31, 58, 138, 0.13)";
    for (let y = -h * 0.3, i = 0; y < h * 1.3; y += fs * 1.55, i++) g.fillText(line, -w * 0.6 - (i % 3) * fs * 2.3, y);
    g.restore();
    return b64(c.toDataURL("image/png"));
  }

  /* ---------- rich-text helpers ---------- */
  // segments: [{t:"text", b:true|false}] -> words (arrays of styled pieces)
  function toWords(segments) {
    const out = []; let cur = [];
    for (const s of segments) {
      for (const p of String(s.t).split(/( +)/)) {
        if (!p) continue;
        if (/^ +$/.test(p)) { if (cur.length) { out.push(cur); cur = []; } }
        else cur.push({ t: p, b: !!s.b, c: s.c });
      }
    }
    if (cur.length) out.push(cur);
    return out;
  }

  async function buildLetter(d) {
    // Only a specimen may be made without the register's record. A real letter needs its reference,
    // verification code, signature and stamp, all of which come from the register.
    if (!d.specimen && !(d.ref && d.code && d.signature && d.stamp))
      throw Object.assign(new Error("No letter was made: the Faculty register did not confirm this request. Please try again; if it keeps happening, contact the Dean’s office."), { fromServer: true });
    const C = window.LETTER_CONFIG.LETTER;
    const pdf = await PDFDocument.create();
    pdf.registerFontkit(window.fontkit);

    const [regB, boldB, headB, crestB] = await Promise.all([
      bytes("assets/fonts/Carlito-Regular.ttf"),
      bytes("assets/fonts/Carlito-Bold.ttf"),
      bytes("assets/img/header.png"),
      bytes("assets/img/crest_wm.png")
    ]);
    const fR = await pdf.embedFont(regB, { subset: true });
    const fB = await pdf.embedFont(boldB, { subset: true });
    const header = await pdf.embedPng(headB);
    const crest = await pdf.embedPng(crestB);
    const sig = d.signature ? await pdf.embedPng(await withRef(d.signature, d.ref, false)) : null;
    const stamp = d.stamp ? await pdf.embedPng(await withRef(d.stamp, d.ref, true)) : null;

    const page = pdf.addPage([W, H]);
    const font = p => (p.b ? fB : fR);
    const wOf = (p, size) => font(p).widthOfTextAtSize(p.t, size);
    const wordW = (w, size) => w.reduce((a, p) => a + wOf(p, size), 0);
    const yTop = (top, size) => H - top - size * ASC;     // top-of-text -> baseline

    function text(t, x, top, o = {}) {
      const size = o.size || SIZE, f = o.bold ? fB : fR;
      page.drawText(t, { x, y: yTop(top, size), size, font: f, color: o.color || BLACK });
      const w = f.widthOfTextAtSize(t, size);
      if (o.underline) {
        page.drawLine({ start: { x, y: yTop(top, size) - 1.3 }, end: { x: x + w, y: yTop(top, size) - 1.3 },
                        thickness: 0.6, color: o.color || BLACK });
      }
      return w;
    }
    function centred(parts, top, size) {      // parts: [{t, b, link}]
      const total = parts.reduce((a, p) => a + (p.b ? fB : fR).widthOfTextAtSize(p.t, size), 0);
      let x = (W - total) / 2;
      for (const p of parts) x += text(p.t, x, top, { size, bold: p.b, color: p.link ? LINK : BLACK, underline: p.link });
    }

    // Break words into lines (forces a break inside any word wider than the column).
    function wrap(words, size, width) {
      const space = fR.widthOfTextAtSize(" ", size);
      const lines = []; let line = [], lw = 0;
      for (let w of words) {
        let ww = wordW(w, size);
        if (ww > width) {                       // very long token: split by characters
          const flat = w.map(p => p.t).join(""), st = w[0];
          let chunk = "";
          for (const ch of flat) {
            if (font(st).widthOfTextAtSize(chunk + ch, size) > width && chunk) {
              if (line.length) { lines.push(line); line = []; lw = 0; }
              lines.push([[{ t: chunk, b: st.b }]]); chunk = "";
            }
            chunk += ch;
          }
          w = [{ t: chunk, b: st.b }]; ww = wordW(w, size);
        }
        const need = line.length ? lw + space + ww : ww;
        if (need > width && line.length) { lines.push(line); line = [w]; lw = ww; }
        else { line.push(w); lw = need; }
      }
      if (line.length) lines.push(line);
      return lines;
    }
    function drawLines(lines, top, lh, justify, size = SIZE) {
      const space = fR.widthOfTextAtSize(" ", size);
      lines.forEach((ln, i) => {
        const natural = ln.reduce((a, w) => a + wordW(w, size), 0) + space * (ln.length - 1);
        const last = i === lines.length - 1;
        const gap = justify && !last && ln.length > 1 ? space + (TW - natural) / (ln.length - 1) : space;
        let x = ML;
        for (const w of ln) {
          for (const p of w) {
            page.drawText(p.t, { x, y: yTop(top + i * lh, size), size, font: font(p), color: p.c || BLACK });
            x += wOf(p, size);
          }
          x += gap;
        }
      });
      return lines.length;
    }

    /* ---------- fixed letterhead ---------- */
    page.drawImage(crest, { x: 208.2, y: H - 307.9 - 239.2, width: 233.8, height: 239.2, opacity: 0.055 });
    page.drawImage(header, { x: 73.4, y: H - 28.8 - 107.2, width: 466.7, height: 107.2 });
    centred([{ t: C.campus, b: true }], 148.3, 12);
    centred([{ t: C.office, b: true }], 170.3, 12);

    // Date (right) with superscript ordinal, reference (left)
    const dt = new Date(d.issuedAt || Date.now());
    const day = String(dt.getDate()), sup = suffix(dt.getDate()), rest = " " + MONTHS[dt.getMonth()] + " " + dt.getFullYear();
    const wDay = fR.widthOfTextAtSize(day, SIZE), wSup = fR.widthOfTextAtSize(sup, 7.2), wRest = fR.widthOfTextAtSize(rest, SIZE);
    let dx = MR - (wDay + wSup + wRest);
    text(day, dx, 191.1); dx += wDay;
    page.drawText(sup, { x: dx, y: yTop(191.1, SIZE) + 3.6, size: 7.2, font: fR, color: BLACK }); dx += wSup;
    text(rest, dx, 191.1);
    if (d.ref) { const w = text("Ref: ", ML, 191.1); text(d.ref, ML + w, 191.1, { bold: true }); }

    /* ---------- body content ---------- */
    const intro = d.kind === "intro", rec = d.kind === "recommendation";
    const him = d.gender === "Female" ? "her" : "him";
    const his = d.gender === "Female" ? "her" : "his";
    const He = d.gender === "Female" ? "She" : "He";
    const article = /^[AEIOU]/i.test(d.programme) ? "an" : "a";
    const ORD = ["first", "second", "third", "fourth", "fifth", "sixth"];
    const yr = ORD[(parseInt(d.year, 10) || 0) - 1];
    let P;

    if (rec) {
      /* ===== General recommendation letter ===== */
      const addressed = !!d.organisation;
      const addr = addressed ? [[{ t: d.attention || "The Selection Committee" }], [{ t: d.organisation, b: true }]] : [];
      if (addressed) String(d.address || "").split(/\n+/).map(s => s.trim()).filter(Boolean).forEach(s => addr.push([{ t: s }]));
      const paras = [
        [{ t: "This is to confirm that " }, { t: d.name, b: true }, { t: ", Registration No. " }, { t: d.regNo, b: true },
         { t: ", is a " }, ...(yr ? [{ t: yr + "-year", b: true }, { t: " " }] : []),
         { t: "student at the Faculty of Engineering and Applied Sciences, Uganda Martyrs University, Fort Portal Campus, pursuing " + article + " " },
         { t: d.programme, b: true }, { t: "." }],
        [{ t: "I understand that " + He.toLowerCase() + " is applying for " }, { t: d.purpose, b: true },
         ...(addressed ? [{ t: " at " + d.organisation }] : []),
         { t: ". The Faculty is pleased to support " + his + " application, and I commend " + him + " to you for your consideration." }],
        [{ t: "I would be grateful for any favourable consideration you can give to " + his + " application. Should you require any further information, please do not hesitate to contact the Office of the Dean." }]
      ];
      const re = [{ t: "RE: RECOMMENDATION FOR " + String(d.name).toUpperCase(), b: true }];
      const plan = (lh, gap, sigGap) => {
        const Q = { lh, gap, sigGap, addr: [], paras: [] };
        let top = 222;
        for (const a of addr) { const ls = wrap(toWords(a), SIZE, 300); Q.addr.push({ top, ls }); top += ls.length * lh; }
        if (addr.length) top += gap;
        Q.dear = top; top += lh + gap;
        Q.reLines = wrap(toWords(re), SIZE, TW); Q.re = top; top += Q.reLines.length * lh + gap;
        for (const p of paras) { const ls = wrap(toWords(p), SIZE, TW); Q.paras.push({ top, ls }); top += ls.length * lh + gap; }
        Q.sincerely = top; top += sigGap;
        Q.name = top; Q.title = top + lh; Q.mobile = top + 2 * lh; Q.email = top + 3 * lh;
        Q.end = Q.email + SIZE;
        return Q;
      };
      for (let k = 0; k <= 12; k++) {
        P = plan(21 - k * 0.4, 9 - k * 0.25, 52 - k * 0.6);
        if (P.end <= 757) break;
      }
      for (const a of P.addr) drawLines(a.ls, a.top, P.lh, false);
      text(addressed ? "Dear Sir/Madam," : "To whom it may concern", ML, P.dear);
      drawLines(P.reLines, P.re, P.lh, false);
      for (const p of P.paras) drawLines(p.ls, p.top, P.lh, true);

      text(addressed ? "Yours faithfully," : "Yours sincerely,", ML, P.sincerely);
      text(C.signatory, ML, P.name);
      text(C.title, ML, P.title);
      const wm = text("Mobile: ", ML, P.mobile, { bold: true }); text(C.mobile, ML + wm, P.mobile, { bold: true });
      const we = text("Email: ", ML, P.email, { bold: true }); text(C.email, ML + we, P.email, { color: LINK, underline: true });
    } else if (!intro) {
      /* ===== Industrial training placement letter ===== */
      const studentPhrase = yr ? [{ t: ", who is a " }, { t: yr + "-year", b: true }, { t: " student at the Faculty of Engineering and Applied Sciences pursuing " + article + " " }]
                               : [{ t: ", who is a student at the Faculty of Engineering and Applied Sciences pursuing " + article + " " }];
      const addr = [[{ t: d.attention || C.defaultAttention }], [{ t: d.company, b: true }]];
      String(d.address || "").split(/\n+/).map(s => s.trim()).filter(Boolean).forEach(s => addr.push([{ t: s }]));
      const paras = [
        [{ t: "I am writing to introduce to you " }, { t: d.name, b: true }, { t: ", Registration No. " },
         { t: d.regNo, b: true }, ...studentPhrase,
         { t: d.programme, b: true }, { t: "." }],
        [{ t: "As a requirement, our students are required to complete an industrial training placement of at least six weeks through the months of June and July of every academic year. This is aimed at providing hands-on practical training in a work environment." }],
        [{ t: "It is for this reason that we kindly request you to place this student in your organization or company, and to assign " + him + " work as you deem appropriate over the course of the student’s stay. " + He + " will be given a logbook to record an account of the work done and skills gained, and a supervisor from the university will visit your organization/company to assess the student’s progress during the course of the training. Also, you will be provided with a form for the relevant supervisor at your organization to evaluate the student upon completion of the training." }],
        [{ t: "We look forward to your assistance, and to working with you on this exercise." }]
      ];
      const re = "RE: REQUEST FOR PLACEMENT OF STUDENT FOR INTERNSHIP/INDUSTRIAL TRAINING";

      // Plan layout; tighten line spacing only if content would run into the footer.
      const plan = (lh, gap, sigGap) => {
        const Q = { lh, gap, sigGap, addr: [], paras: [] };  // tops of every block, in points from the page top
        let top = 220.1;
        for (const a of addr) { const ls = wrap(toWords(a), SIZE, 300); Q.addr.push({ top, ls }); top += ls.length * lh; }
        top += gap; Q.dear = top; top += lh + gap;
        Q.re = top; top += lh + gap;
        for (const p of paras) { const ls = wrap(toWords(p), SIZE, TW); Q.paras.push({ top, ls }); top += (ls.length - 1) * lh + lh + gap; }
        Q.sincerely = top; top += sigGap;
        Q.name = top; Q.title = top + lh; Q.mobile = top + 2 * lh; Q.email = top + 3 * lh;
        Q.end = Q.email + SIZE;
        return Q;
      };
      for (let k = 0; k <= 12; k++) {
        P = plan(20.15 - k * 0.35, 7.95 - k * 0.2, 48.4 - k * 0.5);
        if (P.end <= 757) break;
      }
      for (const a of P.addr) drawLines(a.ls, a.top, P.lh, false);
      text("Dear Sir/Madam,", ML, P.dear);
      text(re, ML, P.re, { bold: true });
      for (const p of P.paras) drawLines(p.ls, p.top, P.lh, true);

      text("Sincerely,", ML, P.sincerely);
      text(C.signatory, ML, P.name);
      text(C.title, ML, P.title);
      const wm = text("Mobile: ", ML, P.mobile, { bold: true }); text(C.mobile, ML + wm, P.mobile, { bold: true });
      const we = text("Email: ", ML, P.email, { bold: true }); text(C.email, ML + we, P.email, { color: LINK, underline: true });
    } else {
      /* ===== Final-year project introductory letter ===== */
      const paras = [
        [{ t: "This is to certify that " }, { t: d.name, b: true }, { t: ", Registration No. " }, { t: d.regNo, b: true },
         { t: ", is our " }, ...(yr ? [{ t: yr + "-year", b: true }, { t: " " }] : []),
         { t: "student pursuing " + article + " " }, { t: d.programme, b: true },
         { t: " at the Faculty of Engineering and Applied Sciences, Fort Portal Campus. The student is currently undertaking " + his + " final year project titled “" },
         { t: d.title, b: true }, { t: "”, which is a requirement for graduation." }],
        [{ t: "Please render to " + him + " any assistance as appropriate." }]
      ];
      const plan = (lh, gap, sigGap) => {
        const Q = { lh, gap, sigGap, paras: [] };
        let top = 232;
        Q.to = top; top += lh + gap * 1.6;
        Q.re = top; top += lh + gap * 1.6;
        for (const p of paras) { const ls = wrap(toWords(p), SIZE, TW); Q.paras.push({ top, ls }); top += ls.length * lh + gap; }
        Q.sincerely = top + 6; top = Q.sincerely + sigGap;          // signature, stamp and QR sit in this space
        Q.name = top; Q.title = top + lh * 1.25; Q.uni = Q.title + lh; Q.mobile = Q.uni + lh; Q.email = Q.mobile + lh;
        Q.end = Q.email + SIZE;
        return Q;
      };
      for (let k = 0; k <= 12; k++) {
        P = plan(23.6 - k * 0.6, 8 - k * 0.3, 70 - k * 1.5);
        if (P.end <= 757) break;
      }
      text("To whom it may concern", ML, P.to);
      const wre = text("RE: ", ML, P.re, { bold: true });
      text("INTRODUCTION OF OUR STUDENT FOR YOUR ASSISTANCE AND COOPERATION", ML + wre, P.re, { bold: true, underline: true });
      for (const p of P.paras) drawLines(p.ls, p.top, P.lh, true);

      text(C.signatory, ML, P.name);
      text("Dean, Faculty of Engineering and Applied Sciences", ML, P.title);
      text("Uganda Martyrs University", ML, P.uni);
      const wm = text("Mob: ", ML, P.mobile, { bold: true }); text(C.mobile, ML + wm, P.mobile);
      const we = text("Email: ", ML, P.email, { bold: true }); text(C.email, ML + we, P.email, { color: LINK, underline: true });
    }

    if (sig) page.drawImage(sig, { x: 92.5, y: H - (P.sincerely + 7.8) - 41.9, width: 66.9, height: 41.9 });
    if (stamp) {
      const sw = 100.3, sh = sw * stamp.height / stamp.width;
      const sx = 121.8, sTop = P.sincerely - 15;
      page.drawImage(stamp, { x: sx, y: H - sTop - sh, width: sw, height: sh, opacity: 0.92 });
      // Date inside the stamp, in red-pink ink, condensed like a dater stamp.
      const st = String(dt.getDate()).padStart(2, "0") + " " + STAMP_MONTHS[dt.getMonth()] + " " + dt.getFullYear();
      const fs = 13.2, natural = fR.widthOfTextAtSize(st, fs), target = sw * 0.54, sx2 = target / natural;
      const cx = sx + sw * 0.49, baseY = H - sTop - sh * 0.50 - fs * 0.32;
      page.pushOperators(pushGraphicsState(), concatTransformationMatrix(sx2, 0, 0, 1, cx - target / 2, baseY));
      page.drawText(st, { x: 0, y: 0, size: fs, font: fR, color: STAMP_INK, opacity: 0.9 });
      page.pushOperators(popGraphicsState());
    }

    /* ---------- verification QR ---------- */
    if (d.verifyUrl) {
      const qr = qrcode(0, "M"); qr.addData(d.verifyUrl); qr.make();
      const n = qr.getModuleCount(), size = 74, m = size / (n + 2);
      const qx = MR - size, qTop = P.sincerely - 8, qy = H - qTop - size;
      page.drawRectangle({ x: qx, y: qy, width: size, height: size, color: rgb(1, 1, 1) });
      for (let r = 0; r < n; r++) {
        let c = 0;
        while (c < n) {
          if (!qr.isDark(r, c)) { c++; continue; }
          let e = c; while (e < n && qr.isDark(r, e)) e++;
          page.drawRectangle({ x: qx + m * (c + 1), y: qy + size - m * (r + 2), width: m * (e - c) + 0.05, height: m + 0.05, color: BLACK });
          c = e;
        }
      }
      const cap1 = "Scan to verify this letter", cap2 = "Code: " + (d.code || "");
      text(cap1, qx + (size - fR.widthOfTextAtSize(cap1, 7)) / 2, qTop + size + 2, { size: 7 });
      text(cap2, qx + (size - fB.widthOfTextAtSize(cap2, 7.5)) / 2, qTop + size + 11, { size: 7.5, bold: true });
      ["Valid only if the details", "match the online record"].forEach((t, i) =>
        text(t, qx + (size - fR.widthOfTextAtSize(t, 6.3)) / 2, qTop + size + 21 + i * 7.6, { size: 6.3, color: rgb(0.35, 0.39, 0.46) }));
    }

    /* ---------- footer ---------- */
    page.drawLine({ start: { x: 70.6, y: H - 766 }, end: { x: 524.9, y: H - 766 }, thickness: 0.9, color: BLACK });
    const F = intro && C.introFooter ? C.introFooter : C;
    centred([{ t: F.footer1 }], 769.9, 12);
    centred([{ t: F.footer2 }], 786.7, 12);
    const fe = [{ t: "Email: " }];
    F.footerEmails.forEach((e, i) => { if (i) fe.push({ t: " /" }); fe.push({ t: e, link: !intro }); });
    centred(fe, 803.5, 12);

    /* ---------- specimen watermark ---------- */
    if (d.specimen) {
      const t = "SPECIMEN – NOT VALID", s = 54, w = fB.widthOfTextAtSize(t, s);
      const a = Math.PI / 4.6;
      page.drawText(t, { x: W / 2 - (w / 2) * Math.cos(a), y: H / 2 - (w / 2) * Math.sin(a), size: s, font: fB,
                         color: rgb(0.85, 0.1, 0.1), opacity: 0.18, rotate: degrees(a * 180 / Math.PI) });
    }

    pdf.setTitle((rec ? "Recommendation Letter – " : intro ? "Final Year Project Introductory Letter – " : "Industrial Training Placement Letter – ") + d.name);
    pdf.setAuthor("Faculty of Engineering and Applied Sciences, Uganda Martyrs University");
    pdf.setSubject((rec ? "Recommendation for " + d.purpose : intro ? "Introduction of student for assistance and cooperation (final year project)"
                          : "Request for placement of student for internship/industrial training") + (d.ref ? " (" + d.ref + ")" : ""));
    pdf.setKeywords([d.ref || "specimen", d.code || "", rec ? d.purpose : intro ? d.title : d.company]);
    pdf.setCreator("FEAS Placement Letter Generator");
    return pdf.save();
  }

  window.buildLetter = buildLetter;
})();
