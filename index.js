const express = require('express')
const mongoose = require('mongoose')
const dotenv = require('dotenv')
const Stripe = require('stripe')
const cors = require('cors')
const bodyParser = require('body-parser')

// Load environment variables
dotenv.config()

// Initialize Express
const app = express()
const PORT = process.env.PORT || 5000

// Middleware
app.use(cors())
app.use(bodyParser.json())

// Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.log('MongoDB connection error:', err))

// Stripe setup
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

// Payment model
const paymentSchema = new mongoose.Schema({
  email: String,
  eventId: String,
  amount: Number,
  stripeSessionId: String,
  planStatus: {
    type: String,
    enum: ['activate', 'finished'],
    default: 'activate',
  },
  paymentStatus: { type: String, default: 'pending' },
  messageLimit: { type: Number },
  messagesSent: { type: Number, default: 0 },
  freePlan: { type: Boolean, default: true },
})

const Payment = mongoose.model('Payment', paymentSchema)

app.get('/', (req, res) => {
  res.send('<h1>Server is running</h1>')
})

// Payment route for creating Stripe checkout sessions
app.post('/api/payment', async (req, res) => {
  const { amount, email, eventId } = req.body

  if (!amount || !email || !eventId) {
    return res
      .status(400)
      .json({ message: 'Amount, email, and eventId are required!' })
  }

  try {
    const totalAmountInCents = amount * 100

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: { name: 'Purchase' },
            unit_amount: totalAmountInCents,
          },
          quantity: 1,
        },
      ],
      success_url: process.env.SUCCESS_URL,
      cancel_url: process.env.CANCEL_URL,
    })

    // Check if the user has used a free plan before
    const previousPayment = await Payment.findOne({ email })

    let messageLimit = 0
    let freePlan = true

    if (!previousPayment || previousPayment.freePlan) {
      // If no previous payment OR the user is still on a free plan, grant 10 messages
      messageLimit = 10
    } else {
      // If the user has paid before, do not grant free messages
      freePlan = false
    }

    // Save payment details in the database
    const newPayment = new Payment({
      email,
      eventId,
      amount,
      stripeSessionId: session.id,
      paymentStatus: 'pending',
      messageLimit,
      freePlan,
    })

    await newPayment.save()

    res.status(200).json({ url: session.url })
  } catch (error) {
    res.status(500).json({
      message: 'Failed to create payment session',
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

// Check message limit route
app.post('/api/send-message', async (req, res) => {
  const { email, message } = req.body

  if (!email || !message) {
    return res.status(400).json({ message: 'Email and message are required' })
  }

  try {
    // Find all active payments for the user, sorted by the latest first
    const payments = await Payment.find({ email, planStatus: 'activate' }).sort(
      { createdAt: -1 }
    )

    if (!payments.length) {
      return res
        .status(404)
        .json({
          status: 'limit_reached',
          message: 'No active payment record found',
        })
    }

    // Use the most recent active plan, or the first in the sorted array
    let payment = payments[0]

    // Check if the user has exceeded their message limit
    if (payment.messagesSent >= payment.messageLimit) {
      payment.planStatus = 'finished'
      await payment.save()

      return res.status(403).json({
        status: 'limit_reached',
        message: `You have reached your message limit of ${payment.messageLimit} messages. Your plan has been updated to finished.`,
      })
    }

    // Simulate sending the message
    payment.messagesSent += 1

    // Save the updated payment record
    await payment.save()

    res.status(200).json({
      message: 'Message sent successfully',
      messagesSent: payment.messagesSent,
      remainingMessages: payment.messageLimit - payment.messagesSent,
    })
  } catch (error) {
    res.status(500).json({
      status: 'limit_reached',
      message: 'Error sending message',
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

// Endpoint to check payment status
app.post('/check-payment-status/:email', async (req, res) => {
  try {
    const { email } = req.params

    // 1. Retrieve all payment records for this user, sorting by newest first
    const payments = await Payment.find({ email }).sort({ createdAt: -1 })

    if (!payments || payments.length === 0) {
      return res.status(404).json({
        error: 'Payment records not found for this user',
      })
    }

    let updatedPayments = []

    for (let payment of payments) {
      // Ignore payments that are already completed
      if (payment.paymentStatus === 'completed') {
        continue
      }

      // 2. Check the payment status with Stripe using the session ID from the payment record
      const stripeSessionId = payment.stripeSessionId
      const session = await stripe.checkout.sessions.retrieve(stripeSessionId)

      let newStatus
      switch (session.payment_status) {
        case 'paid':
          newStatus = 'completed'
          break
        case 'unpaid':
          newStatus = 'failed'
          break
        default:
          newStatus = 'pending'
      }

      // 3. Update only pending payments
      if (payment.paymentStatus !== newStatus || payment.freePlan) {
        payment.paymentStatus = newStatus
        payment.freePlan = false // Mark the free plan as false

        // If the payment is completed, increase messageLimit by 250
        if (newStatus === 'completed') {
          payment.messageLimit += 250
        }

        await payment.save()
        updatedPayments.push(payment)
      }
    }

    // 4. Return the updated payment information
    res.json({
      updatedPayments,
    })
  } catch (error) {
    console.error('Error checking payment status:', error)
    res.status(500).json({
      error: 'Internal server error',
      details: error.message,
    })
  }
})

// Get user payment details and check plan status and message limit
app.get('/check-plan', async (req, res) => {
  const { email } = req.query

  if (!email) {
    return res.status(400).json({ error: 'Email is required' })
  }

  try {
    // Find only the most recent document with an active plan
    const payment = await Payment.findOne({
      email,
      planStatus: 'activate',
    }).sort({ createdAt: -1 })

    if (!payment) {
      return res
        .status(404)
        .json({ success: false, error: 'No active plan found for this user' })
    }

    // Check if message limit is exceeded
    if (payment.messagesSent >= payment.messageLimit) {
      payment.planStatus = 'finished'
      await payment.save()

      return res.status(200).json({
        success: false,
        message: 'Message limit exceeded, plan status changed to finished',
        planStatus: payment.planStatus,
      })
    }

    // If the message limit is not exceeded, return the current status
    return res.status(200).json({
      success: true,
      message: 'User has an active plan and message limit is not exceeded',
      planStatus: payment.planStatus,
      messagesSent: payment.messagesSent,
      messageLimit: payment.messageLimit,
    })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// Start server
app.listen(PORT, () => console.log(`Server running on port ${PORT}`))
