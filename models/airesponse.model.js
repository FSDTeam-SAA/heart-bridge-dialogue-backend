const mongoose = require('mongoose')

const aiResponseSchema = new mongoose.Schema({
  email: String,
  relationID: String,
  userQuestion: String,
  aiResponse: String,

}, { timestamps: true })

const AiResponses = mongoose.model('AiResponse', aiResponseSchema)
module.exports = AiResponses