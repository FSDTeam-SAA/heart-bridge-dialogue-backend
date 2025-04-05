const AiResponses = require('../models/airesponse.model')

const aiResponseController = async (req, res) => {
  const { email, relationID, userQuestion, aiResponse } = req.body
  const newAiResponse = new AiResponses({
    email,
    relationID,
    userQuestion,
    aiResponse,
  })
  try {
    await newAiResponse.save()
    res.status(201).json({ success: true,message: 'AI response saved successfully' })
  } catch (error) {
    console.error(error)
    res.status(500).json({ success: false,message: 'Failed to save AI response' })
  } 
}

const aiResponseByRelationID = async (req, res) => {
    const { relationID } = req.params
    try {
      const aiResponses = await AiResponses.find({ relationID })
      res.status(200).json({success: true,aiResponses})

    } catch (error) {
        res.status(500).json({success: false,message: 'Failed to fetch AI responses' })
      console.error(error)
    }
}

  module.exports = {aiResponseController,aiResponseByRelationID }