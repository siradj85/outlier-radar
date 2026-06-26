/* Locale-aware parsers for YouTube view counts and video age.
   Handles English AND Arabic (the user's YouTube UI), Western + Arabic-Indic
   digits, and Arabic dual forms (يومين = 2 days). Attaches window.TubeRankeParse. */
(function (root) {
  // normalize Arabic-Indic / Eastern digits + Arabic separators to ASCII
  function normDigits(s) {
    if (!s) return "";
    return String(s)
      .replace(/[٠-٩۰-۹]/g, (d) => {
        const c = d.charCodeAt(0);
        if (c >= 0x0660 && c <= 0x0669) return String(c - 0x0660);
        return String(c - 0x06F0);
      })
      .replace(/٫/g, ".") // Arabic decimal separator
      .replace(/٬/g, "")  // Arabic thousands separator
      .replace(/ /g, " "); // non-breaking space
  }

  // parse "1.3 مليون مشاهدة" / "15 ألف مشاهدة" / "6 مشاهدات" / "1.2M views" / "331K subs"
  function parseCount(text) {
    if (!text) return null;
    const t = normDigits(text);

    // determine the multiplier unit
    let mult = 1;
    if (/(billion|مليار)/i.test(t)) mult = 1e9;
    else if (/(million|مليون|ملايين)/i.test(t)) mult = 1e6;
    else if (/(thousand|ألف|الف|آلاف)/i.test(t)) mult = 1e3;
    else {
      const c = t.match(/[\d.,]\s?([kmb])\b/i); // compact suffix right after a number
      if (c) {
        const u = c[1].toLowerCase();
        mult = u === "b" ? 1e9 : u === "m" ? 1e6 : 1e3;
      }
    }

    let val;
    if (mult > 1) {
      // with a unit the number is a small decimal: "1.3", "11.9", "331"
      const num = t.match(/([\d]+[.,]?[\d]*)/);
      if (!num) return null;
      val = parseFloat(num[1].replace(",", "."));
    } else {
      // raw count: commas/periods are thousands separators ("1,234,567")
      const digits = (t.match(/[\d.,]+/) || [""])[0].replace(/[.,]/g, "");
      if (!digits) return null;
      val = parseInt(digits, 10);
    }
    if (isNaN(val)) return null;
    return Math.round(val * mult);
  }

  // unit -> hours, with Arabic dual detection
  const TIME_UNITS = [
    { re: /(year|سنة|سنوات|عام|أعوام|سنتين|عامين)/i, hours: 24 * 365, dual: /(سنتين|عامين)/ },
    { re: /(month|شهر|أشهر|شهور|شهرين)/i, hours: 24 * 30, dual: /(شهرين)/ },
    { re: /(week|أسبوع|أسابيع|اسبوع|أسبوعين|اسبوعين)/i, hours: 24 * 7, dual: /(أسبوعين|اسبوعين)/ },
    { re: /(day|يوم|أيام|ايام|يومين)/i, hours: 24, dual: /(يومين)/ },
    { re: /(hour|ساعة|ساعات|ساعتين)/i, hours: 1, dual: /(ساعتين)/ },
    { re: /(minute|دقيقة|دقائق|دقيقتين)/i, hours: 1 / 60, dual: /(دقيقتين)/ },
    { re: /(second|ثانية|ثوان|ثواني)/i, hours: 1 / 3600, dual: null },
  ];

  // parse "قبل شهر واحد" / "قبل يومين" / "قبل 3 أيام" / "2 days ago" -> age in hours
  function parseAgeHours(text) {
    if (!text) return null;
    const t = normDigits(text);
    for (const u of TIME_UNITS) {
      if (u.re.test(t)) {
        const num = t.match(/(\d+)/);
        let qty;
        if (num) qty = parseInt(num[1], 10);
        else if (u.dual && u.dual.test(t)) qty = 2; // Arabic dual without a digit
        else qty = 1; // "شهر واحد" / "a month"
        return qty * u.hours;
      }
    }
    return null;
  }

  function median(arr) {
    const a = arr.filter((x) => typeof x === "number" && x > 0).sort((x, y) => x - y);
    if (!a.length) return null;
    const mid = Math.floor(a.length / 2);
    return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
  }

  root.TubeRankeParse = { normDigits, parseCount, parseAgeHours, median };
})(typeof window !== "undefined" ? window : self);
