const debug = require('debug')
const moment = require('moment')

const config = require('../config')
const { rpc, getNetworkInfo, wait } = require('../common')
const db = require('../db')

const logger = debug('script')
debug.enable('script')

const timestamp = Math.round(Date.now() / 1000)

const main = async () => {
  logger(`saving telemetry for interval: ${timestamp}`)
  // get telemetry from single node
  const telemetry = await rpc.telemetry()
  if (!telemetry || telemetry.error) {
    return
  }

  let maxCementedCount = 0
  let maxBlockCount = 0
  const telemetryByIp = {}
  for (const item of telemetry.metrics) {
    const blockCount = parseInt(item.block_count, 10)
    if (blockCount > maxBlockCount) maxBlockCount = blockCount

    const cementedCount = parseInt(item.cemented_count, 10)
    if (cementedCount > maxCementedCount) maxCementedCount = cementedCount
    telemetryByIp[`[${item.address}]:${item.port}`] = item
  }

  logger(`received telemetry for ${telemetry.metrics.length} nodes`)

  // get confirmation_quorum from multiple nodes
  const requests = config.rpcAddresses.map((url) =>
    rpc.confirmationQuorum({ url })
  )
  const responses = await Promise.allSettled(requests)
  const results = {}
  for (const res of responses) {
    if (res.value && !res.value.error) {
      for (const peer of res.value.peers) {
        results[peer.account] = peer
      }
    }
  }

  logger(`discovered ${Object.values(results).length} reps`)

  // merge data using ip address & port
  const repInserts = []
  for (const item of Object.values(results)) {
    const node = telemetryByIp[item.ip]
    if (!node) continue
    repInserts.push({
      // data from confirmation_quorum
      account: item.account,
      weight: item.weight,

      // data from telemetry
      block_count: node.block_count,
      block_behind: maxBlockCount - node.block_count,
      cemented_count: node.cemented_count,
      cemented_behind: maxCementedCount - node.cemented_count,
      unchecked_count: node.unchecked_count,
      bandwidth_cap: node.bandwidth_cap,
      peer_count: node.peer_count,
      protocol_version: node.protocol_version,
      uptime: node.uptime,
      major_version: node.major_version,
      minor_version: node.minor_version,
      patch_version: node.patch_version,
      pre_release_version: node.pre_release_version,
      maker: node.maker,
      node_id: node.node_id,
      address: node.address,
      port: node.port,
      telemetry_timestamp: moment(node.timestamp, 'x').unix(),

      timestamp
    })
  }

  if (repInserts.length) {
    logger(`saving metrics for ${repInserts.length} reps`)
    await db('representatives_telemetry').insert(repInserts)
  }

  const nodeInserts = []
  for (const node of telemetry.metrics) {
    // check to see if node exists as a representative
    const rep = repInserts.find((r) => r.node_id === node.node_id)
    if (!rep) {
      nodeInserts.push({
        // data from telemetry
        block_count: node.block_count,
        block_behind: maxBlockCount - node.block_count,
        cemented_count: node.cemented_count,
        cemented_behind: maxCementedCount - node.cemented_count,
        unchecked_count: node.unchecked_count,
        bandwidth_cap: node.bandwidth_cap,
        peer_count: node.peer_count,
        protocol_version: node.protocol_version,
        uptime: node.uptime,
        major_version: node.major_version,
        minor_version: node.minor_version,
        patch_version: node.patch_version,
        pre_release_version: node.pre_release_version,
        maker: node.maker,
        node_id: node.node_id,
        address: node.address,
        port: node.port,
        telemetry_timestamp: moment(node.timestamp, 'x').unix(),

        timestamp
      })
    }
  }

  if (nodeInserts.length) {
    logger(`saving metrics for ${nodeInserts.length} nodes`)
    await db('representatives_telemetry').insert(nodeInserts)
  }

  const now = moment()
  for (const item of repInserts) {
    // get last network stat
    const result = await db('representatives_network')
      .where({
        account: item.account,
        address: item.address
      })
      .limit(1)
      .orderBy('timestamp', 'desc')

    // ignore any ip / address combos fetched within the last three days
    if (
      result.length &&
      moment(result[0].timestamp, 'X').add('3', 'day').isAfter(now)
    ) {
      continue
    }

    const network = await getNetworkInfo(item.address)
    if (network.status === 'success') {
      logger(
        `saving network info for account ${item.account} at ${item.address}`
      )
      await db('representatives_network').insert({
        account: item.account,
        address: item.address,

        continent: network.continent,
        country: network.country,
        countryCode: network.countryCode,
        region: network.region,
        regionName: network.regionName,
        city: network.city,
        zip: network.zip,
        lat: network.lat,
        lon: network.lon,
        timezone: network.timezone,
        isp: network.isp,
        org: network.org,
        as: network.as,
        asname: network.asname,
        hosted: network.hosting,

        timestamp
      })
    }

    await wait(2000)
  }
}

module.exprots = main

if (!module.parent) {
  const init = async () => {
    try {
      await main()
    } catch (err) {
      console.log(err)
    }
    process.exit()
  }

  try {
    init()
  } catch (err) {
    console.log(err)
    process.exit()
  }
}
