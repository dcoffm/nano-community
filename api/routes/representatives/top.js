const express = require('express')
const moment = require('moment')

const { groupBy } = require('../../../common')

const router = express.Router()

router.get('/', async (req, res) => {
  const { logger, db } = req.app.locals
  try {
    const rows = await db('representatives_telemetry')
      .select(
        'representatives_telemetry.account',
        'representatives_telemetry.timestamp',
        'representatives_telemetry.cemented_behind'
      )
      .innerJoin(
        'accounts',
        'representatives_telemetry.account',
        'accounts.account'
      )
      .where('timestamp', '>', moment().subtract('1', 'week').unix())

    const grouped = groupBy(rows, 'account')

    res.send(grouped)
  } catch (error) {
    logger(error)
    res.status(500).send({ error: error.toString() })
  }
})

module.exports = router
