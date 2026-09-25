// Throw one of these for expected business-rule failures
// (insufficient funds, stock not found, market closed...).
// The error handler in server.js sends its message to the client.
// Any other error is treated as a bug and the client only sees a generic 500.
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.expose = true;
  }
}

module.exports = HttpError;
