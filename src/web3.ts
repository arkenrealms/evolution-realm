import * as ethers from 'ethers';
import Web3 from 'web3';
import { log } from '@arken/node/util';
import { getAddress, getRandomProvider } from '@arken/node/util/web3';
import contractInfo from '@arken/node/legacy/contractInfo';
import BEP20Contract from '@arken/node/legacy/contracts/BEP20.json';
import secrets from '../secrets.json';

function _initProvider(ctx) {
  try {
    log('Setting up provider');

    ctx.secrets = secrets;
    ctx.web3Provider = getRandomProvider(secrets);
    ctx.web3 = new Web3(ctx.web3Provider); // TODO: make this ctx.web3 = { bsc: } just like seer (if needed?)

    ctx.ethersProvider = new ethers.providers.Web3Provider(ctx.web3Provider, 'any');
    ctx.ethersProvider.pollingInterval = 15000;

    ctx.signers = {};
    ctx.signers.read = ctx.ethersProvider.getSigner();
    ctx.signers.write = ctx.ethersProvider.getSigner();

    ctx.contracts = {};
    ctx.contracts.wbnb = new ethers.Contract(
      getAddress(ctx.contractInfo.wbnb),
      ctx.contractMetadata.BEP20.abi,
      ctx.signers.read
    );
  } catch (e) {
    log(`Couldn't setup provider.`, e);

    setTimeout(() => _initProvider(ctx), 60 * 1000);
  }
}

export function initProvider(ctx) {
  _initProvider(ctx);

  // setInterval(() => {
  //   // Something hctxened, lets restart the provider
  //   if (new Date().getTime() > ctx.config.trades.updatedTimestamp + 10 * 60 * 1000) {
  //     _initProvider(ctx)
  //   }
  // }, 15 * 60 * 1000)
}

export function initWeb3(ctx) {
  ctx.contractInfo = contractInfo;
  ctx.contractMetadata = {};
  ctx.contractMetadata.BEP20 = BEP20Contract;

  ctx.signers = {
    read: undefined,
    write: undefined,
  };

  initProvider(ctx);
}
