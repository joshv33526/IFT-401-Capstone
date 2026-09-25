// Runs after express-validator rules. Stops the request with 400 if any failed.
const { validationResult } = require("express-validator");

function validate(req, res, next) {
  const result = validationResult(req);
  if (!result.isEmpty()) {
    return res.status(400).json({
      error: "Validation failed",
      details: result.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  next();
}

module.exports = validate;
