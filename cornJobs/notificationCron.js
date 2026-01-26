const cron = require("node-cron");
const Notification = require("../models/notificationModel");
const sendFCM = require("../utils/sendFCM");

const BATCH_SIZE = 50;

const processScheduledNotifications = async () => {
  const now = new Date();

  const notifications = await Notification.find({
    isSent: false,
    scheduledAt: { $lte: now },
  }).limit(BATCH_SIZE);

  for (const notif of notifications) {
    try {
      const user = await require("../models/userModel").findById(
        notif.userId
      );

      if (user?.fcmTokens && user.fcmTokens.length > 0) {
        for (const fcmTokenObj of user.fcmTokens) {
          const { token } = fcmTokenObj;
          await sendFCM(token, {
            title: notif.title,
            body: notif.message,
          });
        }


      }

      notif.isSent = true;
      notif.sentAt = new Date();
      await notif.save();
    } catch (err) {
      console.error("[CRON] Notification send failed", err);
    }
  }

  if (notifications.length > 0) {
    console.log(
      `[CRON] Sent ${notifications.length} scheduled notifications`
    );
  }
};

exports.startNotificationCron = () => {
  cron.schedule("*/2 * * * *", async () => {
    try {
      await processScheduledNotifications();
    } catch (err) {
      console.error("[CRON] Notification cron error", err);
    }
  });

  console.log("[CRON] Notification scheduler started");
};
