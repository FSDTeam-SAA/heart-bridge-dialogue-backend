const Relationship = require('../models/relationship.model')

// Create a new relationship
exports.createRelationship = async (req, res) => {
  try {
    const relationship = new Relationship(req.body)
    await relationship.save()
    res.status(201).json(relationship)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
}

// Get all relationships
exports.getAllRelationships = async (req, res) => {
  try {
    const relationships = await Relationship.find()
    res.status(200).json(relationships)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// Get a single relationship by ID
exports.getRelationshipById = async (req, res) => {
  try {
    const relationship = await Relationship.findById(req.params.id)
    if (!relationship) {
      return res.status(404).json({ message: 'Relationship not found' })
    }
    res.status(200).json(relationship)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// Update a relationship
exports.updateRelationship = async (req, res) => {
  try {
    const relationship = await Relationship.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    )
    if (!relationship) {
      return res.status(404).json({ message: 'Relationship not found' })
    }
    res.status(200).json(relationship)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
}

// Delete a relationship
exports.deleteRelationship = async (req, res) => {
  try {
    const relationship = await Relationship.findByIdAndDelete(req.params.id)
    if (!relationship) {
      return res.status(404).json({ message: 'Relationship not found' })
    }
    res.status(200).json({ message: 'Relationship deleted successfully' })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}
