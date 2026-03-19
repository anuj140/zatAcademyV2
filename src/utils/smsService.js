const twilio = require('twilio');

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

/**
 * Send an OTP via Twilio Verify Service.
 * @param {string} phone - E.164 formatted phone number e.g. "+919876543210"
 */
const sendSmsOtp = async (phone) => {
  await client.verify.v2.services(process.env.TWILIO_VERIFY_SERVICE_SID)
    .verifications
    .create({ to: phone, channel: 'sms' });
};

/**
 * Verify an OTP via Twilio Verify Service.
 * @param {string} phone - E.164 formatted phone number
 * @param {string} code  - The OTP code entered by the user
 * @returns {boolean}    - True if valid, false otherwise
 */
const verifySmsOtp = async (phone, code) => {
  try {
    const verificationCheck = await client.verify.v2.services(process.env.TWILIO_VERIFY_SERVICE_SID)
      .verificationChecks
      .create({ to: phone, code });
      
    return verificationCheck.status === 'approved';
  } catch (error) {
    console.error("[Twilio Verify] Error checking OTP:", error.message);
    return false;
  }
};

module.exports = { sendSmsOtp, verifySmsOtp };
