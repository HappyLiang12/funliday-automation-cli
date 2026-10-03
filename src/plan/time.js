const { FunlidayCliError } = require('../errors');

const HHMM_PATTERN = /^(\d{1,2}):(\d{2})$/;
const SECONDS_PATTERN = /^\d+$/;

function isValidStartTimeValue(value) {
  if (typeof value === 'number') return Number.isInteger(value) && value >= 0;
  if (typeof value !== 'string') return false;
  const text = value.trim();
  if (SECONDS_PATTERN.test(text)) return true;
  const match = text.match(HHMM_PATTERN);
  if (!match) return false;
  return Number(match[1]) <= 23 && Number(match[2]) <= 59;
}

/**
 * Normalizes a `customizeStartTime` value to seconds since midnight.
 *
 * The Funliday API field `customizeStartTime` is seconds since midnight
 * (11:00 = "39600"). This helper additionally accepts "HH:MM" / "H:MM" and
 * converts it. Plain digits are always treated as seconds verbatim: a value
 * like "1100" is ambiguous and is NOT auto-converted from HHMM.
 */
function normalizeStartTimeToSeconds(value) {
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < 0) {
      throw new FunlidayCliError(
        'INVALID_INPUT',
        `Invalid customizeStartTime value: ${JSON.stringify(value)}. Expected seconds since midnight (integer), a numeric string, or "HH:MM".`,
      );
    }
    return String(value);
  }

  if (typeof value === 'string') {
    const text = value.trim();
    if (SECONDS_PATTERN.test(text)) return text;
    const match = text.match(HHMM_PATTERN);
    if (match) {
      const hours = Number(match[1]);
      const minutes = Number(match[2]);
      if (hours <= 23 && minutes <= 59) {
        return String(hours * 3600 + minutes * 60);
      }
    }
  }

  throw new FunlidayCliError(
    'INVALID_INPUT',
    `Invalid customizeStartTime value: ${JSON.stringify(value)}. Expected seconds since midnight (integer or numeric string, e.g. "39600") or "HH:MM" (e.g. "11:00").`,
  );
}

module.exports = {
  HHMM_PATTERN,
  SECONDS_PATTERN,
  isValidStartTimeValue,
  normalizeStartTimeToSeconds,
};
