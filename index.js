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

// Start server
app.listen(PORT, () => console.log(`Server running on port ${PORT}`))
