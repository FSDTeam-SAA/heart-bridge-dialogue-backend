const Stripe = require('stripe')
const dotenv = require('dotenv')
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
const Payment = require('../models/payment.model')
dotenv.config()

// Payment route for creating Stripe checkout sessions
const paymentController= async (req, res) => {
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

    // Check for any existing free plans
    const existingFreePlan = await Payment.findOne({
      email,
      freePlan: true,
      planStatus: { $in: ['free_plan', 'activate'] },
    }).sort({ createdAt: -1 })

    let remainingMessages = 0
    let messageLimit = 0
    let freePlan = false

    if (existingFreePlan) {
      // Calculate remaining messages from free plan
      remainingMessages = Math.max(
        0,
        existingFreePlan.messageLimit - existingFreePlan.messagesSent
      )

      // Mark the free plan as finished
      // existingFreePlan.planStatus = 'finished'
      // existingFreePlan.freePlan = false
      await existingFreePlan.save()
    }

    // Calculate new message limit (remaining from free plan + new plan messages)

    messageLimit = remainingMessages + 250

    // Save payment details in the database
    const newPayment = new Payment({
      email,
      eventId,
      amount,
      stripeSessionId: session.id,
      paymentStatus: 'pending',
      messageLimit,
      messagesSent: 0, 
      freePlan: false, 
    })

    await newPayment.save()

    res.status(200).json({ url: session.url })
  } catch (error) {
    res.status(500).json({
      message: 'Failed to create payment session',
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

// Check message limit route
// const checkMessageLimit = async (req, res) => {
//   const { email, message } = req.body

//   if (!email || !message) {
//     return res.status(400).json({ message: 'Email and message are required' })
//   }

//   try {
//     // Find all active payments for the user, sorted by the latest first
//     const payments = await Payment.find({
//       email,
//       planStatus: { $in: ['activate', 'free_plan'] },
//     }).sort({ createdAt: -1 })


//     if (!payments.length) {
//       return res
//         .status(404)
//         .json({
//           status: 'limit_reached',
//           message: 'No active payment record found',
//         })
//     }

//     // Use the most recent active plan, or the first in the sorted array
//     let payment = payments[0]

//     // Check if the user has exceeded their message limit
//     if (payment.messagesSent >= payment.messageLimit) {
//       payment.planStatus = 'finished'
//       await payment.save()

//       return res.status(403).json({
//         status: 'limit_reached',
//         message: `You have reached your message limit of ${payment.messageLimit} messages. Your plan has been updated to finished.`,
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
//       status: 'limit_reached',
//       message: 'Error sending message',
//       error: error instanceof Error ? error.message : 'Unknown error',
//     })
//   }
// }
// Check message limit route
const checkMessageLimit = async (req, res) => {
  const { email, message } = req.body

  if (!email || !message) {
    return res.status(400).json({ message: 'Email and message are required' })
  }

  try {
    // Find all active payments for the user, sorted by the latest first
    const payments = await Payment.find({
      email,
      planStatus: { $in: ['activate', 'free_plan'] },
    }).sort({ createdAt: -1 })

    if (!payments.length) {
      return res
        .status(404)
        .json({
          status: 'limit_reached',
          message: 'No active payment record found',
        })
    }

    // Check if there are both activate and free_plan statuses
    const hasActivate = payments.some(p => p.planStatus === 'activate')
    const hasFreePlan = payments.some(p => p.planStatus === 'free_plan')
    
    if (hasActivate && hasFreePlan) {
      // Update all free_plan records to finished
      await Payment.updateMany(
        { email, planStatus: 'free_plan' },
        { $set: { planStatus: 'finished' } }
      )
      // Refresh payments list after update
      payments = await Payment.find({
        email,
        planStatus: 'activate',
      }).sort({ createdAt: -1 })
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
}


const paymentStatusCheck = async (req, res) => {
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
      // Skip if payment is already completed or doesn't have a stripeSessionId
      if (payment.paymentStatus === 'completed' || !payment.stripeSessionId) {
        updatedPayments.push(payment)
        continue
      }

      try {
        // 2. Check the payment status with Stripe
        const session = await stripe.checkout.sessions.retrieve(
          payment.stripeSessionId
        )

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

        // Only update if status changed
        if (payment.paymentStatus !== newStatus) {
          payment.paymentStatus = newStatus

          // If the payment is completed, activate the plan
          if (newStatus === 'completed') {
            payment.planStatus = 'activate' // Activate the plan
          }

          await payment.save()
        }

        updatedPayments.push(payment)
      } catch (stripeError) {
        console.error(
          `Error checking Stripe session ${payment.stripeSessionId}:`,
          stripeError
        )
        // Push the unchanged payment if there's a Stripe error
        updatedPayments.push(payment)
      }
    }

    // 4. Return the updated payment information
    res.json({
      success: true,
      updatedPayments,
    })
  } catch (error) {
    console.error('Error checking payment status:', error)
    res.status(500).json({
      error: 'Internal server error',
      details: error.message,
    })
  }
}


// Get user payment details and check plan status and message limit
const checkPlan = async (req, res) => {
  const { email } = req.query

  if (!email) {
    return res.status(400).json({ error: 'Email is required' })
  }

  try {
    // Find the most recent payment with active or completed plan status
    let payment = await Payment.findOne({ email }).sort({ createdAt: -1 })

    // If no payment exists for the user, create a default plan
    if (!payment) {
      const defaultPlan = {
        email,
        planStatus: 'free_plan',
        messagesSent: 0,
        messageLimit: 10,
        paymentStatus: 'completed',
        eventId: 'free plan',
        freePlan: true,
      }

      payment = new Payment(defaultPlan)
      await payment.save()

      return res.status(200).json({
        success: true,
        message: 'New default plan created for user',
        planStatus: payment.planStatus,
        messagesSent: payment.messagesSent,
        messageLimit: payment.messageLimit,
        eventId: payment.eventId,
        freePlan: payment.freePlan,
      })
    }

    // Check for activate plan
    const activePayment = await Payment.findOne({
      email,
      planStatus: 'activate',
    }).sort({ createdAt: -1 })

    // Handle active plan
    if (activePayment) {
      // Check if message limit is exceeded
      if (activePayment.messagesSent >= activePayment.messageLimit) {
        activePayment.planStatus = 'finished'
        await activePayment.save()

        return res.status(200).json({
          success: false,
          message: 'Message limit exceeded, plan status changed to finished',
          planStatus: activePayment.planStatus,
          payment: activePayment,
        })
      }

      // If the plan is active and within limit
      return res.status(200).json({
        success: true,
        message: 'User has an active plan and message limit is not exceeded',
        planStatus: activePayment.planStatus,
        messagesSent: activePayment.messagesSent,
        messageLimit: activePayment.messageLimit,
        eventId: activePayment.eventId,
        freePlan: activePayment.freePlan,
      })
    }

    // Check for free plan
    const freePlanPayment = await Payment.findOne({
      email,
      planStatus: 'free_plan',
    }).sort({ createdAt: -1 })

    if (freePlanPayment) {
      // Check if message limit is exceeded
      if (freePlanPayment.messagesSent >= freePlanPayment.messageLimit) {
        freePlanPayment.planStatus = 'finished'
        await freePlanPayment.save()
        return res.status(200).json({
          success: false,
          message: 'Free plan message limit exceeded',
          planStatus: freePlanPayment.planStatus,
        })
      }

      // If free plan is active and within limit
      return res.status(200).json({
        success: true,
        message:
          'User has an active free plan and message limit is not exceeded',
        planStatus: freePlanPayment.planStatus,
        messagesSent: freePlanPayment.messagesSent,
        messageLimit: freePlanPayment.messageLimit,
        eventId: freePlanPayment.eventId,
        freePlan: freePlanPayment.freePlan,
      })
    }

    // If no active plan is found, send a message with 'finished' status
    return res.status(404).json({
      success: false,
      message: 'No active plan found for this user',
      planStatus: 'finished',
    })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

const finishPlan = async (req, res) => {
  const { email } = req.body

  if (!email) {
    return res.status(400).json({ error: 'Email is required' })
  }

  try {
    // Find the most recent active plan
    const payment = await Payment.findOne({
      email,
      planStatus: 'activate',
    }).sort({ createdAt: -1 })

    if (!payment) {
      return res.status(404).json({
        success: false,
        error: 'No active plan found for this user',
      })
    }

    // Update plan status to 'finished'
    payment.planStatus = 'finished'
    await payment.save()

    return res.status(200).json({
      success: true,
      message: 'Plan status updated to finished successfully',
      planStatus: payment.planStatus,
      messagesSent: payment.messagesSent,
      messageLimit: payment.messageLimit,
      eventId: payment.eventId,
    })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

module.exports = {
  paymentController,
  checkMessageLimit,
  paymentStatusCheck,
  checkPlan,
  finishPlan,
}