import * as ethers from 'ethers'
import Web3 from 'web3'
import { log } from '@arken/node/util'
import { getAddress, getRandomProvider } from '@arken/node/util/web3'
import contractInfo from '@arken/node/contractInfo'
import BEP20Contract from '@arken/node/contracts/BEP20.json'
import secrets from '../../secrets.json'

function _initProvider(app) {
  try {
    log('Setting up provider')

    app.secrets = secrets
    app.web3Provider = getRandomProvider(secrets)
    app.web3 = new Web3(app.web3Provider)

    app.ethersProvider = new ethers.providers.Web3Provider(app.web3Provider, 'any')
    app.ethersProvider.pollingInterval = 15000

    app.signers = {}
    app.signers.read = app.ethersProvider.getSigner()
    app.signers.write = app.ethersProvider.getSigner()

    app.contracts = {}
    app.contracts.wbnb = new ethers.Contract(
      getAddress(app.contractInfo.wbnb),
      app.contractMetadata.BEP20.abi,
      app.signers.read
    )
  } catch (e) {
    log(`Couldn't setup provider.`, e)

    setTimeout(() => _initProvider(app), 60 * 1000)
  }
}

export function initProvider(app) {
  _initProvider(app)

  // setInterval(() => {
  //   // Something happened, lets restart the provider
  //   if (new Date().getTime() > app.config.trades.updatedTimestamp + 10 * 60 * 1000) {
  //     _initProvider(app)
  //   }
  // }, 15 * 60 * 1000)
}

export function initWeb3(app) {
  app.contractInfo = contractInfo
  app.contractMetadata = {}
  app.contractMetadata.BEP20 = BEP20Contract

  app.signers = {
    read: undefined,
    write: undefined,
  }

  initProvider(app)
}
