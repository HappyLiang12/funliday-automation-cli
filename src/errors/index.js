class FunlidayCliError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'FunlidayCliError';
    this.code = code;
    this.details = details;
  }
}

function toErrorCode(error, fallback = 'UNKNOWN_ERROR') {
  return error && error.code ? error.code : fallback;
}

function wrapError(code, message, details) {
  return new FunlidayCliError(code, message, details);
}

module.exports = {
  FunlidayCliError,
  toErrorCode,
  wrapError,
};

