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
  messageLimit: { type: Number, default: 10 }, // Default to 10 messages
  messagesSent: { type: Number, default: 0 }, // Track the number of messages sent
})

const Payment = mongoose.model('Payment', paymentSchema)

app.get('/', (req, res) => {
  res.send('<h1>Server is running</h1>')
})

// Payment route for creating Stripe checkout sessions
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

// Check message limit route
// app.post('/api/send-message', async (req, res) => {
//   const { userId, message } = req.body

//   if (!userId || !message) {
//     return res.status(400).json({ message: 'User ID and message are required' })
//   }

//   try {
//     // Find the payment record for the user
//     const payment = await Payment.findOne({ userId })

//     if (!payment) {
//       return res.status(404).json({ message: 'Payment record not found' })
//     }

//     // Check if the user has exceeded the message limit
//     if (payment.messagesSent >= payment.messageLimit) {
//       return res.status(403).json({
//         status: 'limit_reached', // New status field to signify limit is reached
//         message: `You have reached your message limit of ${payment.messageLimit} messages. Please upgrade your plan to send more messages.`,
//       })
//     }

//     // Simulate sending the message
//     payment.messagesSent += 1

//     // Save the updated payment record
//     await payment.save()

//     res.status(200).json({
//       message: 'Message sent successfully',
//       messagesSent: payment.messagesSent,
//       remainingMessages: payment.messageLimit - payment.messagesSent,
//     })
//   } catch (error) {
//     res.status(500).json({
//       message: 'Error sending message',
//       error: error instanceof Error ? error.message : 'Unknown error',
//     })
//   }
// })

app.post('/api/send-message', async (req, res) => {
  const { userId, message } = req.body

  if (!userId || !message) {
    return res.status(400).json({ message: 'User ID and message are required' })
  }

  try {
    // Find all payments for the user, sorted by latest first
    const payments = await Payment.find({ userId }).sort({ createdAt: -1 })

    if (!payments.length) {
      return res.status(404).json({ message: 'Payment record not found' })
    }

    // First, check if there is a payment with "eventId": "pro_plan"
    let payment = payments.find((payment) => payment.eventId === 'pro_plan')

    // If no "pro_plan" payment exists, use the most recent payment
    if (!payment) {
      payment = payments[0]
    }

    // Check if the user has exceeded the message limit
    if (payment.messagesSent >= payment.messageLimit) {
      return res.status(403).json({
        status: 'limit_reached', // New status field to signify limit is reached
        message: `You have reached your message limit of ${payment.messageLimit} messages. Please upgrade your plan to send more messages.`,
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
      message: 'Error sending message',
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})


// Update message limit after a user purchases a plan
app.post('/api/upgrade-plan', async (req, res) => {
  const { userId, plan } = req.body

  if (!userId || !plan) {
    return res.status(400).json({ message: 'User ID and plan are required' })
  }

  try {
    // Find the payment record for the user
    const payment = await Payment.findOne({ userId })

    if (!payment) {
      return res.status(404).json({ message: 'Payment record not found' })
    }

    // Update the message limit based on the plan
    if (plan === 'premium') {
      payment.messageLimit = 250
    } else if (plan === 'basic') {
      payment.messageLimit = 10
    } else {
      return res.status(400).json({ message: 'Invalid plan' })
    }

    // Save the updated payment record
    await payment.save()

    res.status(200).json({
      message: `Plan upgraded to ${plan}`,
      newMessageLimit: payment.messageLimit,
    })
  } catch (error) {
    res.status(500).json({
      message: 'Error upgrading plan',
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

// payment status
// app.get('/api/payment-status/:userId', async (req, res) => {
//   const { userId } = req.params

//   try {
//     // Find the payment record
//     const payment = await Payment.findOne({ userId })
//     if (!payment) {
//       return res.status(404).json({ message: 'Payment record not found' })
//     }

//     // If the payment has already been marked as 'paid', don't update the message limit
//     if (payment.paymentStatus === 'paid') {
//       return res.status(200).json({
//         message: 'Payment already completed',
//         userId: payment.userId,
//         eventId: payment.eventId,
//         amount: payment.amount,
//         stripeSessionId: payment.stripeSessionId,
//         paymentStatus: payment.paymentStatus,
//         messageLimit: payment.messageLimit,
//       })
//     }

//     // Fetch the latest session status from Stripe
//     const session = await stripe.checkout.sessions.retrieve(
//       payment.stripeSessionId
//     )

//     // If the payment is successful, update the message limit to 250
//     if (session.payment_status === 'paid') {
//       payment.paymentStatus = 'paid'
//       payment.messageLimit = 250
//       await payment.save()
//     } else {
//       // If the payment is not successful, set the payment status to pending
//       payment.paymentStatus = 'pending'
//       await payment.save()
//     }

//     res.status(200).json({
//       userId: payment.userId,
//       eventId: payment.eventId,
//       amount: payment.amount,
//       stripeSessionId: payment.stripeSessionId,
//       paymentStatus: payment.paymentStatus,
//       messageLimit: payment.messageLimit,
//     })
//   } catch (error) {
//     res.status(500).json({
//       message: 'Error retrieving payment status',
//       error: error instanceof Error ? error.message : 'Unknown error',
//     })
//   }
// })

// payment status
// app.get('/api/payment-status/:userId', async (req, res) => {
//   const { userId } = req.params

//   try {
//     // Find all payments for the user
//     const payments = await Payment.find({ userId }).sort({ createdAt: -1 })

//     if (!payments.length) {
//       return res.status(404).json({ message: 'Payment record not found' })
//     }

//     // Filter out "Limit_finished" payments
//     const validPayments = payments.filter(
//       (payment) => payment.eventId !== 'Limit_finished'
//     )

//     // Find the latest "pending" payment
//     const payment = validPayments.find(
//       (payment) => payment.paymentStatus === 'pending'
//     )

//     if (!payment) {
//       // If no "pending" payment is found, return the most recent payment
//       return res.status(200).json(payments[0])
//     }

//     // Fetch the latest session status from Stripe
//     const session = await stripe.checkout.sessions.retrieve(
//       payment.stripeSessionId
//     )

//     // If the payment is successful, update the message limit to 250
//     if (session.payment_status === 'paid') {
//       payment.paymentStatus = 'paid'
//       payment.messageLimit = 250
//     } else {
//       // If the payment is not successful, set the payment status to pending
//       payment.paymentStatus = 'pending'
//     }

//     // Check if message limit is reached
//     if (payment.messageLimit === payment.messagesSent) {
//       payment.eventId = 'Limit_finished'
//     }

//     await payment.save()

//     res.status(200).json(payment)
//   } catch (error) {
//     res.status(500).json({
//       message: 'Error retrieving payment status',
//       error: error instanceof Error ? error.message : 'Unknown error',
//     })
//   }
// })


app.get('/api/payment-status/:userId', async (req, res) => {
  const { userId } = req.params

  try {
    const payments = await Payment.find({ userId }).sort({ createdAt: -1 })

    if (!payments.length) {
      return res.status(404).json({ message: 'Payment record not found' })
    }

    // Update eventId for all payments if needed
    for (const payment of payments) {
      if (
        payment.paymentStatus === 'paid' &&
        Number(payment.messageLimit) <= Number(payment.messagesSent)
      ) {
        payment.eventId = 'Limit_finished'
        await payment.save() // Save the updated eventId
        continue // Skip to the next iteration after updating
      }
    }

    // Now, check if there is a "pro_plan" payment
    const proPlanPayment = payments.find(
      (payment) => payment.eventId === 'pro_plan'
    )

    if (proPlanPayment) {
      return res.status(200).json(proPlanPayment)
    }

    // Proceed with existing logic for pending payments
    const validPayments = payments.filter(
      (payment) => payment.eventId !== 'Limit_finished'
    )

    const payment = validPayments.find(
      (payment) => payment.paymentStatus === 'pending'
    )

    if (!payment) {
      return res.status(200).json(payments[0])
    }

    const session = await stripe.checkout.sessions.retrieve(
      payment.stripeSessionId
    )

    console.log(session.payment_status) // Log session status

    if (session.payment_status === 'paid') {
      payment.paymentStatus = 'paid'
      payment.messageLimit = 250
    } else {
      payment.paymentStatus = 'pending'
    }

    if (Number(payment.messageLimit) <= Number(payment.messagesSent)) {
      payment.eventId = 'Limit_finished'
    }

    await payment.save()

    res.status(200).json(payment)
  } catch (error) {
    res.status(500).json({
      message: 'Error retrieving payment status',
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})


// Start server
app.listen(PORT, () => console.log(`Server running on port ${PORT}`))
