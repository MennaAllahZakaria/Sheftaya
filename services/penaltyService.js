const Incident = require("../models/incidentModel");
const User = require("../models/userModel");
const penaltyRules = require("../config/penaltyRules");

const addDays = (days) => {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
};

const applyAction = (user, action) => {
  let penaltyApplied = "warning";

  if (action === "warning") {
    penaltyApplied = "warning";
  }

  if (action === "block_3_days") {
    user.discipline.blockedUntil = addDays(3);
    penaltyApplied = "blocked 3 days";
  }

  if (action === "block_7_days") {
    user.discipline.blockedUntil = addDays(7);
    penaltyApplied = "blocked 7 days";
  }

  if (action === "block_14_days") {
    user.discipline.blockedUntil = addDays(14);
    penaltyApplied = "blocked 14 days";
  }

  if (action === "block_30_days") {
    user.discipline.blockedUntil = addDays(30);
    penaltyApplied = "blocked 30 days";
  }

  return penaltyApplied;
};

exports.reportIncident = async ({
  userId,
  jobId,
  type,
  severity,
}) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new Error("User not found for incident");
  }

  // سجل Incident
  const incident = await Incident.create({
    userId,
    jobId,
    type,
    severity,
  });

  // تحديث counters
  if (!user.discipline) {
    user.discipline = {
      warnings: 0,
      cancellations: 0,
      noShows: 0,
    };
  }

  let ruleSet;
  let counter;

  if (type === "worker_cancelled") {
    user.discipline.cancellations += 1;
    counter = user.discipline.cancellations;
    ruleSet = penaltyRules.worker.cancel;
  }

  if (type === "worker_no_show") {
    user.discipline.noShows += 1;
    counter = user.discipline.noShows;
    ruleSet = penaltyRules.worker.no_show;
  }

  if (type === "employer_cancelled") {
    user.discipline.cancellations += 1;
    counter = user.discipline.cancellations;
    ruleSet = penaltyRules.employer.cancel;
  }

  let penaltyApplied = "none";

  const matchedRule = ruleSet
    ?.filter((r) => counter >= r.threshold)
    .slice(-1)[0];

  if (matchedRule) {
    penaltyApplied = applyAction(user, matchedRule.action);
  }

  user.discipline.warnings += penaltyApplied === "warning" ? 1 : 0;
  await user.save();

  incident.penaltyApplied = penaltyApplied;
  await incident.save();

  return {
    incident,
    penaltyApplied,
    blockedUntil: user.discipline.blockedUntil,
  };
};
