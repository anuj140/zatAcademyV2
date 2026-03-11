const Razorpay = require('razorpay');
const crypto = require('crypto');

class PaymentService {
  // Lazily initialised so the module can be required without env vars set
  // (useful during tests and code-analysis tools that run without .env)
  get razorpay() {
    if (!this._razorpay) {
      this._razorpay = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
      });
    }
    return this._razorpay;
  }

  /**
   * Create a Razorpay order
   * @param {number} amount - Amount in INR (will be converted to paise)
   * @param {string} currency - Currency code (default: INR)
   * @param {string} receipt - Unique receipt identifier
   * @returns {object} Razorpay order object
   */
  async createOrder(amount, currency = 'INR', receipt = null) {
    const options = {
      amount: Math.round(amount * 100), // Convert to paise
      currency,
      receipt: receipt || `receipt_${Date.now()}`,
      payment_capture: 1, // Auto-capture payment
    };

    const order = await this.razorpay.orders.create(options);
    return order;
  }

  /**
   * Verify Razorpay payment signature (used in frontend callback)
   * @param {string} orderId - Razorpay order ID
   * @param {string} paymentId - Razorpay payment ID
   * @param {string} signature - Signature from Razorpay
   * @returns {object} Verification result
   */
  verifyPayment(orderId, paymentId, signature) {
    const body = `${orderId}|${paymentId}`;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest('hex');

    const isValid = expectedSignature === signature;

    return {
      success: isValid,
      orderId,
      paymentId,
    };
  }

  /**
   * Verify Razorpay webhook signature (used in webhook handler)
   * @param {Buffer|string} rawBody - Raw request body
   * @param {string} signature - X-Razorpay-Signature header
   * @returns {boolean}
   */
  verifyWebhookSignature(rawBody, signature) {
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(rawBody)
      .digest('hex');

    return expectedSignature === signature;
  }

  /**
   * Fetch order details from Razorpay
   * @param {string} orderId
   */
  async fetchOrder(orderId) {
    return await this.razorpay.orders.fetch(orderId);
  }

  /**
   * Fetch payment details from Razorpay
   * @param {string} paymentId
   */
  async fetchPayment(paymentId) {
    return await this.razorpay.payments.fetch(paymentId);
  }

  /**
   * Create EMI schedule
   * @param {number} totalAmount - Total course fee in INR
   * @param {number} emiAmount - Per-installment amount in INR
   * @param {Date} startDate - First due date
   * @returns {Array} Array of EMI schedule objects
   */
  createEMISchedule(totalAmount, emiAmount, startDate) {
    const schedule = [];
    const emiCount = Math.ceil(totalAmount / emiAmount);
    const date = new Date(startDate);

    for (let i = 1; i <= emiCount; i++) {
      const dueDate = new Date(date);
      dueDate.setMonth(dueDate.getMonth() + i);

      // Last EMI handles any remainder
      const amount = i === emiCount
        ? totalAmount - emiAmount * (emiCount - 1)
        : emiAmount;

      schedule.push({
        emiNumber: i,
        amount,
        dueDate,
        status: 'pending',
      });
    }

    return schedule;
  }
}

module.exports = new PaymentService();