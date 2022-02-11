import * as ethers from 'ethers'
import Web3 from 'web3'
import ArcaneItems from '../contracts/ArcaneItems.json'
import BEP20Contract from '../contracts/BEP20.json'
import contracts from '../contracts'
import * as secrets from '../secrets'
import { log, logError } from './'

function getRandomProvider() {
  return ethers.getDefaultProvider("https://thrumming-still-leaf.bsc.quiknode.pro/b2f8a5b1bd0809dbf061112e1786b4a8e53c9a83/") //"wss://thrumming-still-leaf.bsc.quiknode.pro/b2f8a5b1bd0809dbf061112e1786b4a8e53c9a83/")
  // return new HDWalletProvider(
  //   secrets.mnemonic,
  //   "wss://thrumming-still-leaf.bsc.quiknode.pro/b2f8a5b1bd0809dbf061112e1786b4a8e53c9a83/" //"https://bsc.getblock.io/mainnet/?api_key=3f594a5f-d0ed-48ca-b0e7-a57d04f76332" //networks[Math.floor(Math.random() * networks.length)]
  // )
}

let provider = getRandomProvider()

const signer = new ethers.Wallet(secrets.key, provider) //web3Provider.getSigner()

// @ts-ignore
export const web3 = new Web3(provider)

export const signatureAddress = secrets.address

export function getAddress(address) {
  const mainNetChainId = 56
  const chainId = process.env.CHAIN_ID
  return address[chainId] ? address[chainId] : address[mainNetChainId]
}

export function verifySignature(signature) {
  log('Verifying', signature)
  try {
    return web3.eth.accounts.recover(signature.data, signature.hash).toLowerCase() === signature.address.toLowerCase()
  } catch(e) {
    logError(e)
    return false
  }
}

export async function getSignedRequest(data) {
  log('Signing', data)
  try {
    return {
      address: secrets.address,
      hash: (await web3.eth.accounts.sign(data, secrets.key)).signature,
      data
    }
  } catch (e) {
    logError(e)
    return null
  }
}

export const arcaneItemsContract = new ethers.Contract(getAddress(contracts.items), ArcaneItems.abi, signer)
