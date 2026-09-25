// All money math is done in integer cents to avoid floating-point errors
// (in JS, 0.1 + 0.2 !== 0.3). Convert at the edges only.
function toCents(value) {
  return Math.round(Number(value) * 100);
}

function fromCents(cents) {
  return (cents / 100).toFixed(2); // "1234.50" - safe to send to MySQL DECIMAL
}

module.exports = { toCents, fromCents };
