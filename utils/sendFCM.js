const admin = require("../fireBase/admin");
const User = require("../models/userModel");

const MAX_RETRIES = 3;

const sendFCM = async (fcmToken, payload, attempt = 1) => {
  try {
    if (!fcmToken) {
      throw new Error("Missing FCM token");
    }

    const message = {
      token: fcmToken,
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: payload.data || {},
      android: {
        priority: "high",
      },
      apns: {
        headers: {
          "apns-priority": "10",
        },
      },
    };

    const response = await admin.messaging().send(message);

    console.log("[FCM] Sent:", response);
    return response;

  } catch (err) {
    console.error("[FCM] Error:", err.message);

    // Invalid token → امسحيه من اليوزر
    if (
      err.code === "messaging/registration-token-not-registered" ||
      err.code === "messaging/invalid-registration-token"
    ) {
      await User.updateOne(
        { fcmToken },
        { $set: { fcmToken: null } }
      );
      return null;
    }

    // Retry logic
    if (attempt < MAX_RETRIES) {
      console.log(`[FCM] Retrying attempt ${attempt + 1}`);
      return sendFCM(fcmToken, payload, attempt + 1);
    }

    throw err;
  }
};

module.exports = sendFCM;
