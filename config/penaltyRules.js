module.exports = {
  worker: {
    cancel: [
      { threshold: 1, action: "warning" },
      { threshold: 3, action: "block_3_days" },
      { threshold: 5, action: "block_14_days" },
    ],
    no_show: [
      { threshold: 1, action: "block_7_days" },
      { threshold: 3, action: "block_30_days" },
    ],
  },

  employer: {
    cancel: [
      { threshold: 1, action: "warning" },
      { threshold: 3, action: "block_3_days" },
      { threshold: 5, action: "block_14_days" },
    ],
  },
};
