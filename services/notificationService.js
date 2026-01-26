const Notification = require("../models/notificationModel");
const User = require("../models/userModel");
const sendFCM = require("../utils/sendFCM");

exports.scheduleNotification = async ({
  userId,
  type,
  title,
  message,
  relatedJobId,
  scheduledAt,
}) => {
  return Notification.create({
    userId,
    type,
    title,
    message,
    relatedJobId,
    scheduledAt,
  });
};

exports.sendNotificationNow = async ({
  userId,
  type,
  title,
  message,
  relatedJobId,
}) => {
  const user = await User.findById(userId);

  if (!user || !user.fcmTokens || user.fcmTokens.length === 0) {
    return null;
  }

  for (const fcmTokenObj of user.fcmTokens) {
    const { token } = fcmTokenObj;
    await sendFCM(token, {
        title,  
        body: message,
    });
  }
    

  return Notification.create({
    userId,
    type,
    title,
    message,
    relatedJobId,
    isSent: true,
    sentAt: new Date(),
  });
};
