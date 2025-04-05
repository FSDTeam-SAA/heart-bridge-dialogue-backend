const express = require('express')
const router = express.Router()
const {
  paymentController,
  checkMessageLimit,
  paymentStatusCheck,
  checkPlan,
  finishPlan,
} = require('../controllers/paymentController')

router.post('/api/payment', paymentController)
router.get('/check-plan', checkPlan)
router.post('/api/send-message', checkMessageLimit)
router.post('/check-payment-status/:email', paymentStatusCheck)
router.post('/finish-plan', finishPlan)

module.exports = router