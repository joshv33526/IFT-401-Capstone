// Throws one of these for expected business-rule failures
// (insufficient funds, stock not found, market closed...).
// The error handler in server.js sends its message to the client.
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.expose = true;
  }
}

module.exports = HttpError;
