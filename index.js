const express = require('express')
const dotenv = require('dotenv')
const cors = require('cors')
const bodyParser = require('body-parser')
require('dotenv').config()


const dbConnection = require('./config/dbConfig')
const paymentRoutes = require('./routes/paymentRoute')
const aiResponseRoutes = require('./routes/airesponseRouter')

const app = express()
const PORT = process.env.PORT || 5000


app.use(cors())
app.use(bodyParser.json())
dbConnection()

app.use('/', paymentRoutes)
app.use('/api', aiResponseRoutes)
app.get('/', (req, res) => {
  res.send('<h1>Server is running</h1>')
})

// Start server
app.listen(PORT, () => console.log(`Server running on port ${PORT}`))
