const express = require("express");
const {
  aiResponseController,
  aiResponseByRelationID,
} = require('../controllers/airesponseController')

const router = express.Router();

router.post('/ai-response', aiResponseController)
router.get('/ai-response/:relationID', aiResponseByRelationID)

module.exports = router;