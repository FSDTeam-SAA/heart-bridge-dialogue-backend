const mongoose = require('mongoose')

const relationshipSchema = new mongoose.Schema(
  {
    userEmail: { type: String, required: true, unique: true },
    relationshipTitle: { type: String, required: true },
    lengthOfRelationship: { type: String, required: true },
    livingStatus: { type: String, required: true },
    relationshipStage: { type: String, required: true },

    yourPerspective: {
      personName: { type: String, required: true },
      thoughtsAndFeelings: { type: String, required: true },
    },
    theirPerspective: {
      personName: { type: String, required: true },
      thoughtsAndFeelings: { type: String, required: true },
    },

    personalityDetails: {
      person1: {
        loveLanguage: { type: String, required: true },
        communicationStyle: { type: String, required: true },
        conflictStyle: { type: String, required: true },
        attachmentStyle: { type: String, required: true },
      },
      person2: {
        loveLanguage: { type: String, required: true },
        communicationStyle: { type: String, required: true },
        conflictStyle: { type: String, required: true },
        attachmentStyle: { type: String, required: true },
      },
    },
  },
  { timestamps: true }
)

const Relationship = mongoose.model('Relationship', relationshipSchema)
module.exports = Relationship
