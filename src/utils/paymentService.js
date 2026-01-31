// Stub payment service for Phase 1
// Will be replaced with actual Razorpay/Stripe integration in Phase 5

class PaymentService {
  constructor() {
    this.provider = 'razorpay'; // Default provider
  }

  // Create order for payment
  async createOrder(amount, currency = 'INR', receipt = null) {
    // Stub implementation - returns mock data
    console.log(`[Payment Stub] Creating order for amount: ${amount} ${currency}`);
    
    return {
      id: `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      amount: amount * 100, // Convert to paise
      currency: currency,
      receipt: receipt || `receipt_${Date.now()}`,
      status: 'created',
      created_at: Date.now()
    };
  }

  // Verify payment (stub)
  async verifyPayment(orderId, paymentId, signature) {
    console.log(`[Payment Stub] Verifying payment for order: ${orderId}`);
    
    // Always return success in stub mode
    return {
      success: true,
      orderId,
      paymentId,
      amount: 0,
      currency: 'INR',
      method: 'card',
      status: 'captured',
      timestamp: new Date().toISOString()
    };
  }

  // Create EMI schedule
  createEMISchedule(totalAmount, emiAmount, startDate) {
    const schedule = [];
    const emiCount = Math.ceil(totalAmount / emiAmount);
    const date = new Date(startDate);
    
    for (let i = 1; i <= emiCount; i++) {
      const dueDate = new Date(date);
      dueDate.setMonth(dueDate.getMonth() + i);
      
      let amount = emiAmount;
      if (i === emiCount) {
        // Last EMI might be different amount
        amount = totalAmount - (emiAmount * (emiCount - 1));
      }
      
      schedule.push({
        emiNumber: i,
        amount: amount,
        dueDate: dueDate,
        status: 'pending'
      });
    }
    
    return schedule;
  }

  // Send payment reminder (stub)
  async sendPaymentReminder(enrollment, upcomingPayment) {
    console.log(`[Payment Stub] Sending reminder for EMI ${upcomingPayment.emiNumber} to student ${enrollment.student}`);
    
    // In real implementation, this would send email/SMS
    return {
      success: true,
      message: 'Reminder sent successfully'
    };
  }
}

module.exports = new PaymentService();