import { Map } from 'immutable'

import { networkActions } from './actions'
import { accountsActions } from '@core/accounts'

const average = (arr) => arr.reduce((acc, v) => acc + v) / arr.length

export function networkReducer(state = new Map(), { payload, type }) {
  switch (type) {
    case networkActions.GET_NETWORK_STATS_FULFILLED: {
      const { data } = payload
      // eslint-disable-next-line camelcase
      const backlogMedianPr = data.blockCountMedian_pr - data.cementedMedian_pr
      const prs = data.peers
        .filter((p) => p.PR)
        .sort((a, b) => b.weight - a.weight)
      const limit = data.pStakeOnline * 0.67
      let sum = 0
      let i = 0
      for (; i < prs.length && sum < limit; i++) {
        sum += prs[i].weight
      }

      return state.set('stats', {
        ...data,
        prCount: prs.length,
        nakamotoCoefficient: i + 1,
        backlogMedianPr
      })
    }

    case accountsActions.GET_REPRESENTATIVES_FULFILLED: {
      const { data } = payload
      const watts = data.map((d) => d.watt_hour).filter((d) => Boolean(d))
      return state.merge({
        averageWattHour: average(watts)
      })
    }

    default:
      return state
  }
}
