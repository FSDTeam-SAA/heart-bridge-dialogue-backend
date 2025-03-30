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
  userId: String,
  eventId: String,
  amount: Number,
  stripeSessionId: String,
  paymentStatus: { type: String, default: 'pending' },
})

const Payment = mongoose.model('Payment', paymentSchema)
app.get('/', (req, res) => {
  res.send('<h1>Server is running</h1>')
})

// Payment route
app.post('/api/payment', async (req, res) => {
  const { amount, userId, eventId } = req.body

  if (!amount || !userId || !eventId) {
    return res
      .status(400)
      .json({ message: 'Amount, userId, and eventId are required!' })
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

    // Save payment details in the database
    const newPayment = new Payment({
      userId,
      eventId,
      amount,
      stripeSessionId: session.id,
      paymentStatus: 'pending',
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

app.get('/api/payment-status/:userId', async (req, res) => {
  const { userId } = req.params

  try {
    // Find the payment record
    const payment = await Payment.findOne({ userId })
    if (!payment) {
      return res.status(404).json({ message: 'Payment record not found' })
    }

    // Fetch the latest session status from Stripe
    const session = await stripe.checkout.sessions.retrieve(
      payment.stripeSessionId
    )

    // Update payment status in the database if changed
    if (payment.paymentStatus !== session.payment_status) {
      payment.paymentStatus = session.payment_status
      await payment.save()
    }

    res.status(200).json({
      userId: payment.userId,
      eventId: payment.eventId,
      amount: payment.amount,
      stripeSessionId: payment.stripeSessionId,
      paymentStatus: payment.paymentStatus,
    })
  } catch (error) {
    res.status(500).json({
      message: 'Error retrieving payment status',
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})




// Start server
app.listen(PORT, () => console.log(`Server running on port ${PORT}`))
