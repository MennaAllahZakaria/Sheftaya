module.exports = (req, res, next) => {
  try {
    const body = req.body;

    /* ================= PARSE JSON FIELDS ================= */

    if (body.location && typeof body.location === "string") {
      body.location = JSON.parse(body.location);
    }

    if (body.pricePerHour && typeof body.pricePerHour === "string") {
      body.pricePerHour = JSON.parse(body.pricePerHour);
    }

    if (body.requiredSkills && typeof body.requiredSkills === "string") {
      body.requiredSkills = JSON.parse(body.requiredSkills);
    }

    /* ================= CONVERT NUMBERS ================= */

    if (body.dailyWorkHours)
      body.dailyWorkHours = Number(body.dailyWorkHours);

    if (body.requiredWorkers)
      body.requiredWorkers = Number(body.requiredWorkers);

    if (body.pricePerHour?.amount)
      body.pricePerHour.amount = Number(body.pricePerHour.amount);

    next();
  } catch (err) {
    return next(new Error("Invalid JSON in form-data"));
  }
};