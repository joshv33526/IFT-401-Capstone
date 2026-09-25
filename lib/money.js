// All money math is done in integer cents to avoid floating-point errors
function toCents(value) {
  return Math.round(Number(value) * 100);
}

function fromCents(cents) {
  return (cents / 100).toFixed(2);
}

module.exports = { toCents, fromCents };
