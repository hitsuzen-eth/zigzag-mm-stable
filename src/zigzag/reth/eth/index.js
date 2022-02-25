import BigNumber from "bignumber.js"
import axios from "axios"
import zksync from "zksync"
import {ethers} from "ethers";
import WebSocket from "ws";
import HeartBeats from 'heartbeats'
import log from 'loglevel'

import {checkIfTradeIsOk, checkSafeToTrade, liquidityStable} from "../../../core/index.js";

// ZiZag websocket
const ZIGZAG_WS = typeof process.env.ZIGZAG_WS !== 'undefined' ?  process.env.ZIGZAG_WS : 'wss://zigzag-exchange.herokuapp.com'
// Ethereum node RPC
const ETH_RPC = typeof process.env.ETH_RPC !== 'undefined' ? process.env.ETH_RPC : 'http://localhost:8545'
// Network used(name)
const NETWORK = typeof process.env.NETWORK !== 'undefined' ? process.env.NETWORK : 'mainnet'
// Chain used(number)
const CHAIN_ID = parseInt(typeof process.env.CHAIN_ID !== 'undefined' ? process.env.CHAIN_ID : '1')
// Your private key used for the MM bot
const PRIVATE_KEY = typeof process.env.PRIVATE_KEY !== 'undefined' ? process.env.PRIVATE_KEY : ''
if (!PRIVATE_KEY) throw Error('No private key !')
// Random client ID for zigzag liquidity
const CLIENT_ID = typeof process.env.CLIENT_ID !== 'undefined' ? process.env.CLIENT_ID : (Math.random() * 100000).toString(16)
// Market id on ZigZag(string)
const MARKET_ID = typeof process.env.MARKET_ID !== 'undefined' ? process.env.MARKET_ID : 'rETH-ETH'
// How much Basic point the bot will ask at least(1bp = 0.01%)
const MIN_SPREAD_BP = new BigNumber(typeof process.env.MIN_SPREAD_BP !== 'undefined' ? process.env.MIN_SPREAD_BP : 5)
// How much Basic point the bot will ask at most(1bp = 0.01%)
const MAX_SPREAD_BP = new BigNumber(typeof process.env.MAX_SPREAD_BP !== 'undefined' ? process.env.MAX_SPREAD_BP : 40)
// Used to define the curve of spread based on inventory imbalance(MUST BE ODD NUMBER !!!)
const EXPONENT = new BigNumber(typeof process.env.EXPONENT !== 'undefined' ? process.env.EXPONENT : 3)
// Used to define the curve of spread based on inventory imbalance
const RANGE_FOCUS = new BigNumber(typeof process.env.RANGE_FOCUS !== 'undefined' ? process.env.RANGE_FOCUS : 0.5)
// How much slice will be used to indicate liquidity to ZigZag
const SLICE = new BigNumber(typeof process.env.SLICE !== 'undefined' ? process.env.SLICE : 100)
// Id Asset A (number)
const RETH_ID = parseInt(typeof process.env.RETH_ID) !== 'undefined' ? process.env.RETH_ID : 132
// Id Asset B (number)
const ETH_ID = parseInt(typeof process.env.ETH_ID) !== 'undefined' ? process.env.ETH_ID : 0
// Log level
const LOG_LEVEL = typeof process.env.LOG_LEVEL !== 'undefined' ? process.env.LOG_LEVEL : 0
log.setLevel(LOG_LEVEL)

const pow18 = new BigNumber(10).pow(18)

// Internal state
let rEthFee = 1
let ethFee = 1
let openOrderSignature = ''
let openOrderDate = (Date.now() / 1000 | 0)
let wallet = null
let zigzagWs = null
const heartBeat = HeartBeats.create(1000, 'tartiflette')


// Retrieve fair price of rETH/ETH on-chain
export const getFairPrice = async () => {
    try {
        const resultSync = await axios.post(
            ETH_RPC,
            {"jsonrpc":"2.0","method":"eth_syncing","params":[],"id":74}
        ).catch(() => false)
        if (!resultSync) throw Error('Node is down')
        const diffSync = parseInt(resultSync?.data?.result?.highestBlock || 0, 16) - parseInt(resultSync?.result?.data?.currentBlock || 0, 16)
        if (diffSync > 3) throw Error(`Node is syncing ${diffSync}`)

        const result = await axios.post(
            ETH_RPC,
            {
                "jsonrpc": "2.0",
                "id": 5,
                "method": "eth_call",
                "params": [{
                    "from": "0x0000000000000000000000000000000000000000",
                    "data": "0x8b32fa230000000000000000000000000000000000000000000000000de0b6b3a7640000",
                    "to": "0xae78736cd615f374d3085123a210448e74fc6393"
                }, "latest"]
            }
        ).catch(() => {})
        if (!result?.data?.result) throw Error('Node is down')

        const fairPrice = new BigNumber(result.data.result, 16).div(pow18)
        if (!checkSafeToTrade(fairPrice)) throw Error(`Fair price is not safe ${fairPrice.toString()}.`)

        return fairPrice
    } catch (e) {
        log.error('Failed to fetch fair price.')
        log.error(e.toString())
        return new BigNumber(0)
    }
}

// Create ZkSync wallet
export const getZkSyncWallet = async () => {
    try {
        const _wallet = await zksync.Wallet.fromEthSigner(
            new ethers.Wallet(PRIVATE_KEY),
            await zksync.getDefaultProvider(NETWORK)
        ).catch(() => null)
        if (!_wallet)throw Error('Failed to get ETH signer.')

        if (!(await _wallet.isSigningKeySet().catch(() => false)))
            await _wallet.setSigningKey({
                feeToken: "ETH",
                ethAuthType: "ECDSA",
            }).catch(() => log.error('Failed to set signing key.'))

        return _wallet
    } catch (e) {
        log.error('Failed to get zkSync wallet.')
        log.error(e.toString())
        return false
    }
}

//Open ZigZag websocket
export const startZigZagWebsocket = async (onOpen, onClose, onMessage, onError) => {
    try {
        return await (new Promise((resolve) => {
            log.info('Try to open websocket...')
            let _zigzagWs = new WebSocket(ZIGZAG_WS)
            _zigzagWs.on('open', () => {
                onOpen(_zigzagWs)
                log.info('Websocket open ! ')
                resolve(_zigzagWs)
            })
            _zigzagWs.on('error', onError)
            _zigzagWs.on('close', onClose)
            _zigzagWs.on('message', onMessage)
        }))
    } catch (e) {
        log.error('Failed to open websocket.')
        log.error(e.toString())
        return false
    }
}

// Get balance from zkSync
export const getBalance = async () => {
    try {
        return await wallet.getAccountState().catch(() => false)
    } catch (e) {
        log.error('Failed to fetch balance.')
        return false
    }
}

// Transform order list to order object
export const orderListToObj = (order) => {
    const [chainId, orderId, marketId, side, price, reth, eth, expires, userId, orderStatus, remaining] = order
    return {chainId, orderId, marketId, side, price, reth, eth, expires, userId, orderStatus, remaining}
}

// Compute liquidity for X slice
export const processLiquidity = async () => {
    try {
        log.debug('Fetch zkSync balance...')
        const balance = await getBalance().catch(() => false)
        if (!balance) throw Error('Failed to fetch zkSync balance')

        const reth = new BigNumber(balance.committed.balances['rETH'] || 0).div(pow18)
        const eth = new BigNumber(balance.committed.balances['ETH'] || 0).div(pow18)

        if (eth.isZero() && reth.isZero()) throw Error('Wallet Empty !')
        log.debug('Fetch zkSync balance done.')

        log.debug('Get RETH ratio...')
        const fairPrice = await getFairPrice().catch(() => new BigNumber(0))
        if (fairPrice.isZero()) throw Error('Failed to retrieve fair price !')
        log.debug('Get RETH ratio done.')

        log.debug('Compute liquidity...')
        const liquidity = liquidityStable(
            MIN_SPREAD_BP,
            MAX_SPREAD_BP,
            EXPONENT,
            RANGE_FOCUS,
            SLICE,
            fairPrice,
            reth,
            eth)
        if (!liquidity || !liquidity.length) throw Error('Failed to compute liquidity !')
        log.debug('Compute liquidity done.')

        return liquidity
    } catch (e) {
        log.error('Failed to process liquidity.')
        log.error(e.toString())
        return false
    }
}

// Send liquidity information to ZigZag
export const indicateLiquidity = async () => {
    try {
        if (!zigzagWs) return
        const liquidity = await processLiquidity().catch(() => 0)
        if (!liquidity || !liquidity.length) throw Error('Failed to compute liquidity !')

        await zigzagWs.send(JSON.stringify({op: "indicateliq2", args: [CHAIN_ID, MARKET_ID, liquidity, CLIENT_ID]}))
    } catch (e) {
        log.error('Failed to indicate liquidity.')
        log.error(e.toString())
        return false
    }
}

// Check if order received is in our range and send the counter trade
export const processOrder = async (order) => {
    try {
        log.debug('Wait previous order is process...')
        await new Promise(async (resolve) => {
            while(openOrderSignature)
                await new Promise((resolve) => setTimeout(resolve, 200))
            resolve(true)
        })
        log.debug('Wait previous order is process done.')

        order = orderListToObj(order)
        log.debug({...order})
        if (order.chainId !== CHAIN_ID || order.marketId !== MARKET_ID) return

        log.debug('Fetch zkSync balance...')
        const balance = await getBalance().catch(() => false)
        if (!balance) throw Error('Failed to fetch ZKsync balance !')

        const reth = new BigNumber(balance.committed.balances['rETH'] || 0).div(pow18)
        const eth = new BigNumber(balance.committed.balances['ETH'] || 0).div(pow18)
        log.debug(`Inventory ETH: ${eth.toFixed()}, RETH: ${reth.toFixed()}`)

        if (eth.isZero() && reth.isZero()) throw Error('Wallet Empty !')
        log.debug('Fetch zkSync balance done.')

        log.debug('Get RETH ratio...')
        const fairPrice = await getFairPrice().catch(() => new BigNumber(0))
        if (fairPrice.isZero()) throw Error('Failed to retrieve fair price !')
        log.debug(`Fair price ${fairPrice.toFixed()}`)
        log.debug('Get RETH ratio done.')

        log.debug('Check if price match with fee...')
        if (!checkIfTradeIsOk(
            order.side === 'b',
            MIN_SPREAD_BP,
            MAX_SPREAD_BP,
            EXPONENT,
            RANGE_FOCUS,
            fairPrice,
            reth,
            eth,
            new BigNumber(order.reth),
            new BigNumber(order.eth),
            order.side === 'b' ? new BigNumber(ethFee) : new BigNumber(rEthFee))) return
        log.debug('Check if price match with fee done.')

        log.debug('Fill order...')
        const orderDetails = {
            tokenSell: order.side === 'b' ? RETH_ID : ETH_ID,
            tokenBuy: order.side === 'b' ? ETH_ID : RETH_ID,
            amount: zksync.utils.closestPackableTransactionAmount(wallet.provider.tokenSet.parseToken(
                order.side === 'b' ? RETH_ID : ETH_ID,
                order.side === 'b'
                    ? `${(new BigNumber(order.reth)).times(1.00001).toFixed(18)}`
                    : `${(new BigNumber(order.eth)).times(1.00001).toFixed(18)}`
            )),
            ratio: zksync.utils.tokenRatio({
                [ETH_ID]: `${(new BigNumber(order.eth)).times(order.side === 'b' ?  0.99999: 1.00001).toFixed(18)}`,
                [RETH_ID]: `${(new BigNumber(order.reth)).times(order.side === 'b' ? 1.00001 : 0.99999).toFixed(18)}`
            }),
            validUntil: (Date.now() / 1000 | 0) + 60
        }
        log.debug({...orderDetails})

        const fillOrder = await wallet.getOrder(orderDetails).catch(() => false)
        if (!fillOrder) throw Error('Failed to create fillOrder !')
        log.debug({...fillOrder})
        openOrderSignature = fillOrder.signature.signature
        openOrderDate = (Date.now() / 1000 | 0) + 70
        log.debug('Fill order done.')

        log.debug('Fill request...')
        await zigzagWs.send(JSON.stringify({op: 'fillrequest', args: [CHAIN_ID, order.orderId, fillOrder]}))
        log.debug('Fill request done.')

        log.info('New order matched !')

        return true
    } catch (e) {
        log.error('Failed to process order.')
        log.error(e.toString())
        return false
    }
}

// Check if it's our own order and broadcast him
export const processBroadcast = async (orderId, orderRequest, orderFill) => {
    try {
        log.debug({...orderRequest})
        log.debug({...orderFill})
        log.debug({openOrderSignature})
        log.debug('Check if its our order...')
        if (openOrderSignature !== orderFill.signature.signature) return

        log.debug('Broadcast order...')
        const broadcast = await wallet.syncSwap({
            orders: [orderRequest, orderFill],
            feeToken: 'ETH',
            nonce: orderFill.nonce
        }).catch(() => false)
        if (!broadcast) throw Error('Failed to broadcast !')
        log.debug({...broadcast})
        log.debug('Broadcast order done.')

        log.debug('Update order to broadcasted...')
        await zigzagWs.send(JSON.stringify({
            op: 'orderstatusupdate',
            args: [[[CHAIN_ID, orderId, 'b', broadcast.txHash.split(":")[1]]]]
        }))
        log.debug('Update order to broadcasted done.')

        log.debug('Wait receipt...')
        const receipt = await broadcast.awaitReceipt().catch(() => false)
        if (!receipt) throw Error('Failed to receive receipt !')
        await zigzagWs.send(JSON.stringify({
            op: 'orderstatusupdate', args: [[[
                CHAIN_ID,
                orderId,
                receipt?.success ? 'f' : 'r',
                broadcast.txHash.split(":")[1],
                receipt?.success ? null : broadcast?.error?.toString()]]]
        }))
        log.debug('Wait receipt done.')

        log.info('Order broadcasted !')

        return true
    } catch (e) {
        log.error('Failed to process order...')
        log.error(e.toString())
        await zigzagWs.send(JSON.stringify({
            op: 'orderstatusupdate', args: [[[
                CHAIN_ID,
                orderId,
                'r']]]
        }))
        return false
    } finally {
        log.debug('Reset open order.')
        openOrderSignature = ''
    }
}

// Handle message from ZigZag websocket server
export const handleMessage = async (message) => {
    try {
        message = JSON.parse(message)
        if (message?.op === 'orders') {
            for (let order of message?.args[0]) {
                await processOrder(order).catch(() => log.error('Failed to process order.'))
            }
        }
        if (message?.op === 'userordermatch') {
            await processBroadcast(message.args[1], message.args[2], message.args[3]).catch(() => log.error('Failed to broadcast order.'))
        }
        if (message?.op === 'marketinfo') {
            rEthFee = Math.max(message?.args[0]?.baseFee || rEthFee, 0)
            ethFee = Math.max(message?.args[0]?.quoteFee || ethFee, 0)
        }

    } catch (e) {
        log.error('Failed to handle message.')
        log.error(e.toString())
        return false
    }
}

// Handle open websocket and subscribe to rETH/ETH market
export const handleOpen = (_zigzagWs) => {
    try {
        _zigzagWs.send(JSON.stringify({op: "subscribemarket", args: [1, MARKET_ID]}))
    } catch (e) {
        log.error('Failed to handle open.')
        log.error(e.toString())
        return false
    }
}

(async () => {
    log.debug('Load zkSync wallet...')
    wallet = await getZkSyncWallet().catch(() => null)
    if (!wallet) throw Error('Failed to load zkSync wallet.')
    log.debug('Load zkSync wallet done.')

    log.debug('Create heartbeat...')
    // indicate liquidity to ZigZag
    heartBeat.createEvent(5, async () => await indicateLiquidity())
    // Check if open order has not expired, and remove the lock
    heartBeat.createEvent(10, async () => openOrderSignature = (Date.now() / 1000 | 0) < openOrderDate ? openOrderSignature : '')
    // Try to reconnect to websocket if it closed or not already open
    heartBeat.createEvent(10, async () => {
        if (zigzagWs && zigzagWs.readyState === WebSocket.OPEN) return

        log.debug('Start ZigZag Websocket...')
        zigzagWs = await startZigZagWebsocket(
            handleOpen,
            () => log.info('Websocket closed.'),
            handleMessage,
            (error) => {
                log.error('WebSocket error !')
                log.error({...error})
            },
        )
        if (!zigzagWs) throw Error('Failed to create websocket.')
        log.debug('Start ZigZag Websocket done.')
    })
    log.debug('Create heartbeat done.')

})().then(() => log.info('READY !!!!'))
    .catch((e) => {
        log.error('Failed to start the bot.')
        log.error(e.toString())
    })
