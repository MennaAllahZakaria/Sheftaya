const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");

const {
  sendNotificationNow,
  scheduleNotification
} = require("../services/notificationService");

const {sendEmail}= require("./sendEmail");

exports.handleWorkerAcceptedNotifications = async (application, job) => {
  try {
    // notify worker
    if (
      application.workerId.fcmTokens &&
      application.workerId.fcmTokens.length > 0
    ) {
      await sendNotificationNow({
        userId: application.workerId,
        type: "تم قبول طلبك للوظيفة",
        title: "تم قبول طلبك للوظيفة",
        message: `تم قبول طلبك للوظيفة "${job.title}". يرجى تسجيل الدخول إلى حسابك لمزيد من التفاصيل.`,
        relatedJobId: job._id,
      });
    } else {
      await sendEmail({
        Email: application.workerId.email,
        subject: "تم قبول طلبك للوظيفة",
        message: `تم قبول طلبك للوظيفة "${job.title}". يرجى تسجيل الدخول إلى حسابك لمزيد من التفاصيل.`,
      });
    }

    await notificationService.scheduleNotification({
      userId: application.workerId,
      type: "job_reminder_24h",
      title: "تذكير بالشغل",
      message: `بكرة عندك شغل ${job.title}`,
      relatedJobId: job._id,
      scheduledAt: new Date(
        new Date(job.startDateTime).getTime() - 24 * 60 * 60 * 1000
      ),
    });

    await notificationService.scheduleNotification({
      userId: application.workerId,
      type: "job_reminder_2h",
      title: "تذكير بالشغل",
      message: `فاضل ساعتين على شغل ${job.title}`,
      relatedJobId: job._id,
      scheduledAt: new Date(
        new Date(job.startDateTime).getTime() - 2 * 60 * 60 * 1000
      ),
    });
  } catch (err) {
    console.error("Notification error:", err);
  }
};


exports.handleWorkerRejectedNotifications = async (application, job) => {
  try {
    if (
      application.workerId.fcmTokens &&
      application.workerId.fcmTokens.length > 0
    ) {
      await sendNotificationNow({
        userId: application.workerId._id,
        type: "تم رفض طلبك للوظيفة",
        title: "تم رفض طلبك للوظيفة",
        message: `تم رفض طلبك للوظيفة "${job.title}". يرجى تسجيل الدخول إلى حسابك لمزيد من التفاصيل.`,
        relatedJobId: job._id,
      });
    } else {
      await sendEmail({
        Email: application.workerId.email,
        subject: "تم رفض طلبك للوظيفة",
        message: `تم رفض طلبك للوظيفة "${job.title}". يرجى تسجيل الدخول إلى حسابك لمزيد من التفاصيل.`,
      });
    }
  } catch (err) {
    console.error("Reject notification error:", err);
  }
};