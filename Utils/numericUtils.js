// const pattern = /[^-]\d+([.]\d{0,2})?/ig;
// const pattern = /((\s|\+)\d+(\.\d{0,2})?)/ig; // p2 str - /\d+\.?\d{0,2}/gmi || /\-\d+\.?\d{0,2}/g || /^[^\-\s\.]\d*\.?\d{0,2}/gm
// const pattern = /^[0-9]+\.?\d{0,2}/; // p1 str - /^\d+[(\.)(\d{0,2})]?/gmi // TODO - Find the best matchig Pattern

const MUMERIC_WITH_DECIMAL_PATTERN = /^\d+\.?\d{0,2}/;

export const checkForNumberWithDecialAllowed = (value) => {
    return MUMERIC_WITH_DECIMAL_PATTERN.test(value);
}

export const getNumberWithDecimal = (value) => {
    if (checkForNumberWithDecialAllowed(value)) return String(value).match(MUMERIC_WITH_DECIMAL_PATTERN)[0]
    return false;
}