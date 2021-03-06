const { Router } = require('express')
const logger = require('signale')
const config = require('config')
const client = require('../db')
const utils = require('../utils')

const urls = require('../../../static/url.json')
const DURATION = config.get('durationCalendar') || 3000

const router = Router()

async function dbFallback (req, res, reqU, reqN, reqT, blocklist, name) {
  try {
    const query = await client.query({
      name: 'fetch-data',
      text: 'SELECT data, timestamp FROM public.edt WHERE univ = $1 AND spec = $2 AND grp = $3;',
      values: [reqU, reqN, reqT]
    })
    if (query.rows[0]) {
      const tmp = {
        status: 'db',
        name
      }

      if (query.rows[0].data && Object.entries(query.rows[0].data).length) {
        const tmpEvents = utils.getEvents(query.rows[0].data, blocklist, req)
        if (tmpEvents.length) {
          tmp.data = tmpEvents
        } else {
          return res.status(500).send('Coup dur. Une erreur 500. Aucune sauvegarde non plus... (1)')
        }
      } else {
        return res.status(500).send('Coup dur. Une erreur 500. Aucune sauvegarde non plus... (2)')
      }

      if (query.rows[0].timestamp) {
        tmp.timestamp = new Date(query.rows[0].timestamp).getTime()
      }
      return res.json(tmp)
    } else {
      return res.status(500).send('Coup dur. Une erreur 500. Aucune sauvegarde non plus... (3)')
    }
  } catch (err) {
    logger.error(err)
    return res.status(500).send('Coup dur. Une erreur 500.')
  }
}

router.use('/calendar', async (req, res) => {
  let reqU = config.get('default.univ') || 'iutvannes'
  let reqN = config.get('default.spec') || 'lp'
  let reqT = config.get('default.grp') || 'dlis'

  let blocklist = []
  if (req.cookies && req.cookies.blocklist) {
    try {
      blocklist = JSON.parse(req.cookies.blocklist).map(name => name.toUpperCase())
    } catch (e) {
      blocklist = []
    }
  }

  if (req.query && req.query.u && req.query.n && req.query.t) {
    reqU = req.query.u
    reqN = req.query.n
    reqT = req.query.t
  }

  try {
    const univ = urls.find(u => u.univ === reqU)
    const univ2 = univ.univ_edts.find(u => u.id === reqN)
    const univ3 = univ2.edts.find(u => u.id === reqT)
    const tmpUrl = univ3.url
    const name = univ.title + ' > ' + univ2.title + ' ' + univ3.title

    const data = await utils.fetchData(tmpUrl, DURATION)
    if (data) {
      const events = utils.getEvents(data, blocklist, req)

      await res.json({
        status: 'on',
        name,
        timestamp: new Date().getTime(),
        data: events
      })
    } else if (process.env.DATABASE_URL) {
      await dbFallback(req, res, reqU, reqN, reqT, blocklist, name)
    } else {
      res.status(500).send('Coup dur. Une erreur 500. Et surtout pas de DATABASE_URL.')
    }
  } catch (err) {
    logger.error(err)
    res.status(500).send('Une erreur est survenue, veuillez vérifier les paramètres.')
  }
})

module.exports = router
