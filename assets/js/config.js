/* =====================================================================
   SITE SETTINGS — the only file you normally need to edit.
   ===================================================================== */
window.LETTER_CONFIG = {
  /* Paste the Web App URL from Google Apps Script here (Deploy → Manage
     deployments → Web app URL). Until you do, the site runs in SPECIMEN
     mode: letters are watermarked, unsigned and NOT recorded. */
  API_URL: "https://script.google.com/macros/s/AKfycbxTQ0s_OcL4I2my8fOyP-ASJ8ewEjTfOSAYDM4THMps4b4P0hzVe8O5ybK-hPra8chUuA/exec",

  /* Shows the "Access code" box on the student forms. The codes
     themselves live only in the Apps Script (ACCESS_CODES in Code.gs). */
  REQUIRE_ACCESS_CODE: true,

  /* Optional "I am not a robot" check (Cloudflare Turnstile). Paste the site key here and the
     secret key into TURNSTILE_SECRET in Code.gs. Leave "" to switch it off. */
  TURNSTILE_SITE_KEY: "",

  /* Confirm placement: the largest distance (km) from the town/centre a student
     may enter. Must match MAX_DISTANCE_KM in Code.gs. */
  DISTANCE_MAX_KM: 50,

  /* Confirm placement: the largest one-way transport fare (UGX) from the town/centre
     to the work site a student may enter. Must match MAX_FARE_UGX in Code.gs. */
  FARE_MAX_UGX: 100000,

  /* Registration number formats, checked in the browser for quick feedback
     (the Apps Script checks them again). Must match REGNO_PATTERNS in Code.gs. */
  REGNO: {
    Diploma:  { pattern: "^\\d{4}-D\\d{3}-\\d{5}$", example: "2023-D131-93058" },
    Bachelor: { pattern: "^\\d{4}-B\\d{3}-\\d{5}$", example: "2022-B472-92991" }
  },

  /* Programme names as they appear in the letter. "name" and "years" MUST
     match the PROGRAMMES list in the Apps Script (Code.gs). "short" is used
     for sheet names in the class-list download (max 20 characters); "label"
     is the shorter text shown in the dropdown, if different from "name". */
  PROGRAMMES: [
    { group: "Diploma", name: "Diploma in Civil Engineering",      short: "Dip Civil",      years: 2 },
    { group: "Diploma", name: "Diploma in Electrical Engineering", short: "Dip Electrical", years: 2 },
    { group: "Diploma", name: "Diploma in Mechanical Engineering", short: "Dip Mechanical", years: 2 },
    { group: "Diploma", name: "Diploma in Water Engineering",      short: "Dip Water",      years: 2 },
    { group: "Bachelor's degree", name: "Bachelor of Science in Civil Engineering", label: "BSc Civil Engineering",      short: "BSc Civil",      years: 4 },
    { group: "Bachelor's degree", name: "Bachelor of Science in Electrical Engineering", label: "BSc Electrical Engineering", short: "BSc Electrical", years: 4 },
    { group: "Bachelor's degree", name: "Bachelor of Science in Mechanical and Manufacturing Engineering", label: "BSc Mechanical & Manufacturing Engineering", short: "BSc Mech & Mfg", years: 4 }
  ],

  /* Text printed on the letter. */
  LETTER: {
    campus: "Fort Portal Campus",
    office: "Office of the Dean – Faculty of Engineering and Applied Sciences",
    signatory: "Elly Olomo",
    title: "Dean, Faculty of Engineering and Applied Sciences, Uganda Martyrs University",
    mobile: "0779 009970",
    email: "deanfeas@umu.ac.ug",
    footer1: "Uganda Martyrs University P. O. Box 44 – Fort Portal – Uganda",
    footer2: "Tel: +256 779009970/+256 782590232",
    footerEmails: ["deanfeas@umu.ac.ug", "tkobusinge@umu.ac.ug"],
    defaultAttention: "The Human Resource Manager",
    /* Footer of the final-year project introductory letter (as on the Faculty's Word template). */
    introFooter: {
      footer1: "Uganda Martyrs University P. O. Box 44 – Fort Portal – Uganda",
      footer2: "Tel: (+256) 039 2178840/039 3215788",
      footerEmails: ["deanfeas@umu.ac.ug"]
    }
  }
};
