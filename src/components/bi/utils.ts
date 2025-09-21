/**
 * Utilities for BI dashboard normalization and formatting.
 */

export const defaultCurrency = "USD";

export const safeNumber = (v: any) => {
  if (v === undefined || v === null || v === "") return 0;
  if (typeof v === "number") return v;
  const cleaned = String(v).replace(/[,\s]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
};

export function formatMonthLabel(ym: string) {
  try {
    const [yStr, mStr] = (ym || "").split("-");
    if (!yStr || !mStr) return ym;
    const y = Number(yStr);
    const m = Number(mStr);
    if (!Number.isFinite(y) || !Number.isFinite(m)) return ym;
    return new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric" }).format(new Date(y, m - 1, 1));
  } catch {
    return ym;
  }
}

/**
 * Normalize many possible upstream month representations to "YYYY-MM".
 * - Accepts YYYY-MM, YYYYMM, YYYYMMDD, localized month names (English & Polish common forms),
 *   Date.parseable strings, arrays like [2025,3], objects {year, month}, etc.
 * - Returns a string (may be the original value as fallback).
 */
export function normalizeToYearMonth(raw: any): string {
  if (raw === null || raw === undefined) return "";
  // If already YYYY-MM string
  if (typeof raw === "string") {
    const s = raw.trim();

    // Directly match YYYY-MM or YYYY-M
    const ym = s.match(/^(\d{4})-(\d{1,2})$/);
    if (ym) {
      const y = ym[1];
      const m = ym[2].padStart(2, "0");
      return `${y}-${m}`;
    }

    // YYYY-MM-DD
    const ymd = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (ymd) {
      const y = ymd[1];
      const m = ymd[2].padStart(2, "0");
      return `${y}-${m}`;
    }

    // Compact YYYYMM or YYYYMMDD
    const compact = s.match(/^(\d{4})(\d{2})(\d{2})?$/);
    if (compact) {
      const y = compact[1];
      const m = compact[2];
      return `${y}-${m}`;
    }

    // Try to parse localized month names (Polish and common English/short forms)
    try {
      // helper to strip diacritics and lowercase
      const normalizeStr = (src: string) =>
        src.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

      // mapping normalized month name fragments -> month number
      const monthNamesMap: Record<string, number> = {
        // English full & short
        january: 1,
        jan: 1,
        february: 2,
        feb: 2,
        march: 3,
        mar: 3,
        april: 4,
        apr: 4,
        may: 5,
        june: 6,
        jun: 6,
        july: 7,
        jul: 7,
        august: 8,
        aug: 8,
        september: 9,
        sept: 9,
        sep: 9,
        october: 10,
        oct: 10,
        november: 11,
        nov: 11,
        december: 12,
        dec: 12,
        // Polish (nominative/genitive/short forms) - normalized (diacritics removed)
        stycznia: 1,
        stycz: 1,
        styczen: 1,
        sty: 1,
        lutego: 2,
        luty: 2,
        lut: 2,
        marca: 3,
        marzec: 3,
        mar: 3,
        kwietnia: 4,
        kwiecien: 4,
        kwi: 4,
        maja: 5,
        maj: 5,
        czerwca: 6,
        czerwiec: 6,
        cze: 6,
        lipca: 7,
        lipiec: 7,
        lip: 7,
        sierpnia: 8,
        sierpien: 8,
        sie: 8,
        wrzesnia: 9,
        wrzesien: 9,
        wrz: 9,
        pazdziernika: 10,
        pazdziernik: 10,
        paz: 10,
        pazdz: 10,
        pazdzier: 10,
        listopada: 11,
        listopad: 11,
        lis: 11,
        grudnia: 12,
        grudzien: 12,
        gru: 12,
      };

      const norm = normalizeStr(s);

      // Attempt patterns like "kwietnia 2025", "kwi 2025", "april 2025"
      const monthNameThenYear = norm.match(/^([a-ząęółśżźćń\-.]{3,})\s+(\d{4})$/u);
      if (monthNameThenYear) {
        const namePart = monthNameThenYear[1].replace(/\./g, "");
        const y = monthNameThenYear[2];
        const mapped = monthNamesMap[namePart];
        if (mapped) return `${y}-${String(mapped).padStart(2, "0")}`;
      }

      // Patterns like "2025 kwietnia"
      const yearThenMonthName = norm.match(/^(\d{4})\s+([a-ząęółśżźćń\-.]{3,})$/u);
      if (yearThenMonthName) {
        const y = yearThenMonthName[1];
        const namePart = yearThenMonthName[2].replace(/\./g, "");
        const mapped = monthNamesMap[namePart];
        if (mapped) return `${y}-${String(mapped).padStart(2, "0")}`;
      }

      // Any month token and a year anywhere
      const anyMonth = norm.match(/([a-ząęółśżźćń\-.]{3,})/u);
      const anyYear = norm.match(/(\d{4})/);
      if (anyMonth && anyYear) {
        const namePart = anyMonth[1].replace(/\./g, "");
        const y = anyYear[1];
        const mapped = monthNamesMap[namePart];
        if (mapped) return `${y}-${String(mapped).padStart(2, "0")}`;
      }
    } catch {
      // fallthrough to Date.parse fallback
    }

    // Try Date.parse (e.g. "Mar 2025")
    const parsed = Date.parse(s);
    if (!Number.isNaN(parsed)) {
      const d = new Date(parsed);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      return `${y}-${m}`;
    }

    // Fallback to string (keep it so debug can show unmapped ident)
    return s;
  }

  // Arrays like [2025,3] or ["2025","03"]
  if (Array.isArray(raw) && raw.length >= 2) {
    const a0 = raw[0];
    const a1 = raw[1];
    const y = Number(a0);
    const m = Number(a1);
    if (Number.isFinite(y) && Number.isFinite(m) && m >= 1 && m <= 12) {
      return `${String(y)}-${String(m).padStart(2, "0")}`;
    }
  }

  // Objects with year/month keys
  if (typeof raw === "object") {
    if (raw.year && raw.month) {
      const y = Number(raw.year);
      const m = Number(raw.month);
      if (Number.isFinite(y) && Number.isFinite(m) && m >= 1 && m <= 12) {
        return `${String(y)}-${String(m).padStart(2, "0")}`;
      }
    }
    // sometimes Odoo returns arrays inside objects or the group label under 'value' etc.
    if ((raw as any).value) {
      return normalizeToYearMonth((raw as any).value);
    }
  }

  try {
    return String(raw);
  } catch {
    return "";
  }
}

/** Generate array of YYYY-MM for a full calendar year (Jan..Dec) */
export function monthsForYear(year: string) {
  const y = Number(year);
  if (!Number.isFinite(y)) return [];
  const arr: string[] = [];
  for (let m = 1; m <= 12; m++) {
    arr.push(`${y}-${String(m).padStart(2, "0")}`);
  }
  return arr;
}