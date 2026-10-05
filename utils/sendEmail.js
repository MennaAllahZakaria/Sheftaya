const SibApiV3Sdk = require("sib-api-v3-sdk");
const ApiError = require("./apiError");

const client = SibApiV3Sdk.ApiClient.instance;

client.authentications["api-key"].apiKey =
  process.env.BREVO_API_KEY;

const emailApi = new SibApiV3Sdk.TransactionalEmailsApi();

const sendEmail = async (options) => {
  if (!process.env.BREVO_API_KEY) {
    throw new ApiError("Email service is not configured", 503);
  }

  if (!options?.Email || !options?.subject || !options?.message) {
    throw new ApiError("Invalid email payload", 400);
  }

  try {
    await emailApi.sendTransacEmail({
      sender: {
        name: process.env.BREVO_SENDER_NAME || "SHEFTAYA",
        email: process.env.BREVO_SENDER_EMAIL || "sheftaya.jobs@gmail.com",
      },
      to: [
        {
          email: options.Email,
        },
      ],
      subject: options.subject,
      textContent: options.message,
    });
  } catch (error) {
    const providerMessage =
      error?.response?.body?.message || error?.response?.text || error?.message;
    console.error("Brevo email delivery failed:", providerMessage);
    throw new ApiError("Email service is temporarily unavailable", 503);
  }
};

module.exports = sendEmail;
