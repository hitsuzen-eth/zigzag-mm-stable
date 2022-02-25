import BigNumber from "bignumber.js"

// Compute spread bp based on inventory imbalance
export const spreadBpByImbalance = (
    isBuy,
    minSpreadBp = new BigNumber(10),
    maxSpreadBp = new BigNumber(250),
    exponent = new BigNumber(3),
    rangeFocus = new BigNumber(0.5),
    assetValueA,
    assetValueB) => {
    if (exponent.mod(2).isZero()) throw Error('Exponent should be odd number')

    const imbalance = isBuy
        ? assetValueA.minus(assetValueB)
            .div(assetValueA.plus(assetValueB))
        : assetValueB.minus(assetValueA)
            .div(assetValueA.plus(assetValueB))

    const squareRoot = rangeFocus.times((imbalance.isPositive()
        ? imbalance
        : new BigNumber(0)).sqrt())

    const spread = imbalance
        .pow(exponent)
        .plus(squareRoot)
        .div(rangeFocus.plus(1))
        .times(maxSpreadBp)

    return spread.isGreaterThan(minSpreadBp) ? spread : minSpreadBp
}

// Generate x price quote
export const liquidityStable = (
    minSpreadBp = new BigNumber(5),
    maxSpreadBp = new BigNumber(150),
    exponent = new BigNumber(3),
    rangeFocus = new BigNumber(0.5),
    sliceSide = new BigNumber(10),
    fairPrice = new BigNumber(1),
    assetA,
    assetB,
) => {
    let liquidity = []
    let _assetA = new BigNumber(assetA)
    let _assetB = new BigNumber(assetB)

    // Buy Side (-B => +A)
    while (liquidity.length !== +sliceSide) {
        const quantityB = assetB.div(sliceSide)
        const spread = spreadBpByImbalance(
            true,
            minSpreadBp,
            maxSpreadBp,
            exponent,
            rangeFocus,
            _assetA.times(fairPrice).plus(quantityB),
            _assetB.minus(quantityB))
        const limitPrice = fairPrice.times((new BigNumber(1)).minus(spread.div(10000)))
        liquidity.push(['b', +limitPrice, +quantityB])
        _assetA = _assetA.plus(quantityB.div(limitPrice))
        _assetB = _assetB.minus(quantityB)
    }

    _assetA = new BigNumber(assetA)
    _assetB = new BigNumber(assetB)
    // Sell Side (-A => +B)
    while (liquidity.length !== sliceSide * 2) {
        const spread = spreadBpByImbalance(
            false,
            minSpreadBp,
            maxSpreadBp,
            exponent,
            rangeFocus,
            _assetA.minus(assetA.div(sliceSide)).times(fairPrice),
            _assetB.plus(assetA.div(sliceSide).times(fairPrice)))
        const limitPrice = fairPrice.times((new BigNumber(1)).plus(spread.div(10000)))
        const quantityB = assetA.div(sliceSide).times(limitPrice)
        liquidity.push(['s', +limitPrice, +quantityB])
        _assetA = _assetA.minus(quantityB.div(limitPrice))
        _assetB = _assetB.plus(quantityB)
    }

    return liquidity.sort((a, b) => a[1] - b[1])
}

// Hard coded safety check for rETH/ETH ratio(99% useless but I feel better to have it so...)
export const checkSafeToTrade = (rEthEthRatio) => rEthEthRatio.isGreaterThan(1.01) && rEthEthRatio.isLessThan(1.1)

// Check if an offer match our requirements, spread + fixed fee
export const checkIfTradeIsOk = (isBuy,
                                 minSpreadBp = new BigNumber(5),
                                 maxSpreadBp = new BigNumber(150),
                                 exponent = new BigNumber(3),
                                 rangeFocus = new BigNumber(0.5),
                                 fairPrice,
                                 assetA,
                                 assetB,
                                 tradeAssetA,
                                 tradeAssetB,
                                 fee) => {
    if (isBuy) {
        const spread = spreadBpByImbalance(
            false, // When someone want to buy we need to sell
            minSpreadBp,
            maxSpreadBp,
            exponent,
            rangeFocus,
            assetA.minus(tradeAssetA).times(fairPrice),
            assetB.minus(fee).plus(tradeAssetB))
        const price = spread
            .div(10000)
            .plus(1)
            .times(fairPrice)
        const priceTrade = tradeAssetB.minus(fee).div(tradeAssetA)
        return price.isLessThanOrEqualTo(priceTrade)
    }

    const spread = spreadBpByImbalance(
        true, // When someone want to sell we need to buy
        minSpreadBp,
        maxSpreadBp,
        exponent,
        rangeFocus,
        assetA.minus(fee).plus(tradeAssetA).times(fairPrice),
        assetB.minus(tradeAssetB))
    const price = spread
        .div(10000)
        .plus(1)
        .times(fairPrice)
    const priceTrade = tradeAssetB.div(tradeAssetA.minus(fee))
    return price.isGreaterThanOrEqualTo(priceTrade)
}