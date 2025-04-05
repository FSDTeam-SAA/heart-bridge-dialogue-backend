const mongoose = require('mongoose')

const aiResponseSchema = new mongoose.Schema({
  email: String,
  eventId: String,
  amount: Number,
  stripeSessionId: String,
  planStatus: {
    type: String,
    enum: ['activate', 'finished', 'free_plan'],
  },
  paymentStatus: { type: String, default: 'pending' },
  messageLimit: { type: Number, default: 10 },
  messagesSent: { type: Number, default: 0 },
  freePlan: { type: Boolean },
})

const Payment = mongoose.model('AiResponse', aiResponseSchema)
module.exports = Payment