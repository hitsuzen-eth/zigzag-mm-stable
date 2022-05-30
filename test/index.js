import assert from 'assert'
import BigNumber from "bignumber.js";

import {checkIfTradeIsOk, checkSafeToTrade, liquidityStable, spreadBpByImbalance} from '../src/core/index.js'

describe('Core', () => {
    describe('spreadBpByImbalance()', () => {
        it('should throw error', () => {
            assert.throws(
                () => spreadBpByImbalance(
                    true,
                    new BigNumber(5),
                    new BigNumber(150),
                    new BigNumber(4),
                    new BigNumber(0.5),
                    new BigNumber(10),
                    new BigNumber(10)),
                new Error('Exponent should be odd number')
                )
            assert.throws(
                () => spreadBpByImbalance(
                    false,
                    new BigNumber(5),
                    new BigNumber(150),
                    new BigNumber(4),
                    new BigNumber(0.5),
                    new BigNumber(10),
                    new BigNumber(10)),
                new Error('Exponent should be odd number')
                )
        })
        it('A=10, B=10 => should return minSpread 5bp', () => {
            assert.equal(
                +spreadBpByImbalance(
                    true,
                    new BigNumber(5),
                    new BigNumber(150),
                    new BigNumber(3),
                    new BigNumber(0.5),
                    new BigNumber(10),
                    new BigNumber(10)),
                5)
            assert.equal(
                +spreadBpByImbalance(
                    false,
                    new BigNumber(5),
                    new BigNumber(150),
                    new BigNumber(3),
                    new BigNumber(0.5),
                    new BigNumber(10),
                    new BigNumber(10)),
                5)
        })

        it('A=10, B=0 => should return Buy maxSpread 150bp and Sell minSpread', () => {
            assert.equal(
                +spreadBpByImbalance(
                    true,
                    new BigNumber(5),
                    new BigNumber(150),
                    new BigNumber(3),
                    new BigNumber(0.5),
                    new BigNumber(10),
                    new BigNumber(0)),
                150)
            assert.equal(
                +spreadBpByImbalance(
                    false,
                    new BigNumber(5),
                    new BigNumber(150),
                    new BigNumber(3),
                    new BigNumber(0.5),
                    new BigNumber(10),
                    new BigNumber(0)),
                5)
        })

        it('A=0, B=0 => should return minSpread 5bp', () => {
            assert.equal(
                +spreadBpByImbalance(
                    true,
                    new BigNumber(5),
                    new BigNumber(150),
                    new BigNumber(3),
                    new BigNumber(0.5),
                    new BigNumber(0),
                    new BigNumber(0)),
                5)
            assert.equal(
                +spreadBpByImbalance(
                    false,
                    new BigNumber(5),
                    new BigNumber(150),
                    new BigNumber(3),
                    new BigNumber(0.5),
                    new BigNumber(0),
                    new BigNumber(0)),
                5)
        })

        it('A=0, B=10 => should return Buy minSpread and Sell maxSpread 150bp', () => {
            assert.equal(
                +spreadBpByImbalance(
                    true,
                    new BigNumber(5),
                    new BigNumber(150),
                    new BigNumber(3),
                    new BigNumber(0.5),
                    new BigNumber(0),
                    new BigNumber(10)),
                5)
            assert.equal(
                +spreadBpByImbalance(
                    false,
                    new BigNumber(5),
                    new BigNumber(150),
                    new BigNumber(3),
                    new BigNumber(0.5),
                    new BigNumber(0),
                    new BigNumber(10)),
                150)
        })

        it('A=5, B=15 => should return Buy minSpread 5bp Sell 18.75bp', () => {
            assert.equal(
                +spreadBpByImbalance(
                    true,
                    new BigNumber(5),
                    new BigNumber(150),
                    new BigNumber(3),
                    new BigNumber(0.5),
                    new BigNumber(5),
                    new BigNumber(15)),
                5)
            assert.equal(
                spreadBpByImbalance(
                    false,
                    new BigNumber(5),
                    new BigNumber(150),
                    new BigNumber(3),
                    new BigNumber(0.5),
                    new BigNumber(5),
                    new BigNumber(15)).toFixed(3),
                '47.855')
        })

        it('A=2, B=18 => should return Buy minSpread 5bp Sell 18.75bp', () => {
            assert.equal(
                +spreadBpByImbalance(
                    true,
                    new BigNumber(5),
                    new BigNumber(150),
                    new BigNumber(3),
                    new BigNumber(0.5),
                    new BigNumber(2),
                    new BigNumber(18)),
                5)
            assert.equal(
                spreadBpByImbalance(
                    false,
                    new BigNumber(5),
                    new BigNumber(150),
                    new BigNumber(3),
                    new BigNumber(0.5),
                    new BigNumber(2),
                    new BigNumber(18)).toFixed(3),
                '95.921')
        })
    })
    describe('liquidityStable()', () => {
        it('should return Buy 10A at 0.99B and Sell 10A at 1.01B ', () => {
            const liquidity = liquidityStable(
                new BigNumber(5),
                new BigNumber(100),
                new BigNumber(3),
                new BigNumber(0.5),
                new BigNumber(1),
                new BigNumber(1),
                new BigNumber(10),
                new BigNumber(10))
            assert.equal(liquidity[0][0], 'b')
            assert.equal(liquidity[1][0], 's')

            assert.equal(liquidity[0][1], 0.99)
            assert.equal(liquidity[1][1], 1.01)

            assert.equal(liquidity[0][2], 10)
            assert.equal(liquidity[1][2], 10.1)
        })
        it('should return 3 Buy and 3 Sell', () => {
            const liquidity = liquidityStable(
                new BigNumber(5),
                new BigNumber(100),
                new BigNumber(3),
                new BigNumber(0.5),
                new BigNumber(3),
                new BigNumber(1),
                new BigNumber(10),
                new BigNumber(10))
            assert.equal(liquidity[0][0], 'b')
            assert.equal(liquidity[1][0], 'b')
            assert.equal(liquidity[2][0], 'b')
            assert.equal(liquidity[3][0], 's')
            assert.equal(liquidity[4][0], 's')
            assert.equal(liquidity[5][0], 's')

            assert.equal(+parseFloat(liquidity[0][1]).toFixed(4), 0.99)
            assert.equal(+parseFloat(liquidity[1][1]).toFixed(4), 0.9953)
            assert.equal(+parseFloat(liquidity[2][1]).toFixed(4), 0.9978)
            assert.equal(+parseFloat(liquidity[3][1]).toFixed(4), 1.0022)
            assert.equal(+parseFloat(liquidity[4][1]).toFixed(4), 1.0047)
            assert.equal(+parseFloat(liquidity[5][1]).toFixed(4), 1.01)

            assert.equal(liquidity[0][2], +(new BigNumber(10)).div(3))
            assert.equal(liquidity[1][2], +(new BigNumber(10)).div(3))
            assert.equal(liquidity[2][2], +(new BigNumber(10)).div(3))
            assert.equal(parseFloat(liquidity[3][2]).toFixed(4), (new BigNumber(10)).div(3).times(1.0021714).toFixed(4))
            assert.equal(parseFloat(liquidity[4][2]).toFixed(4), (new BigNumber(10)).div(3).times(1.004697).toFixed(4))
            assert.equal(parseFloat(liquidity[5][2]).toFixed(4), (new BigNumber(10)).div(3).times(1.01).toFixed(4))
        })
        it('should return 3 Buy and 3 Sell with 1 A => 2 B', () => {
            const liquidity = liquidityStable(
                new BigNumber(5),
                new BigNumber(100),
                new BigNumber(3),
                new BigNumber(0.5),
                new BigNumber(3),
                new BigNumber(2),
                new BigNumber(10),
                new BigNumber(20))
            assert.equal(liquidity[0][0], 'b')
            assert.equal(liquidity[1][0], 'b')
            assert.equal(liquidity[2][0], 'b')
            assert.equal(liquidity[3][0], 's')
            assert.equal(liquidity[4][0], 's')
            assert.equal(liquidity[5][0], 's')

            assert.equal(+parseFloat(liquidity[0][1]).toFixed(4), 0.99*2)
            assert.equal(+parseFloat(liquidity[1][1]).toFixed(4), 0.9953*2)
            assert.equal(+parseFloat(liquidity[2][1]).toFixed(4), (0.9978*2)+0.0001)
            assert.equal(+parseFloat(liquidity[3][1]).toFixed(4), +((1.0022*2)-0.0001).toFixed(4))
            assert.equal(+parseFloat(liquidity[4][1]).toFixed(4), 1.0047*2)
            assert.equal(+parseFloat(liquidity[5][1]).toFixed(4), 1.01*2)

            assert.equal(liquidity[0][2], +(new BigNumber(20)).div(3))
            assert.equal(liquidity[1][2], +(new BigNumber(20)).div(3))
            assert.equal(liquidity[2][2], +(new BigNumber(20)).div(3))
            assert.equal(parseFloat(liquidity[3][2]).toFixed(4), (new BigNumber(10)).div(3).times(1.0021714*2).toFixed(4))
            assert.equal(parseFloat(liquidity[4][2]).toFixed(4), (new BigNumber(10)).div(3).times(1.004697*2).toFixed(4))
            assert.equal(parseFloat(liquidity[5][2]).toFixed(4), (new BigNumber(10)).div(3).times(1.01*2).toFixed(4))
        })
    })
    describe('checkSafeToTrade()', () => {
        it('should return true', () => {
            assert.ok(checkSafeToTrade(new BigNumber(1.015)))
            assert.ok(checkSafeToTrade(new BigNumber(1.09)))
        })
        it('should return false', () => {
            assert.ok(!checkSafeToTrade(new BigNumber(1.01)))
            assert.ok(!checkSafeToTrade(new BigNumber(1.1)))
        })
    })
    describe('checkIfTradeIsOk()', () => {
        it('Buy/sell no fee should return true', () => {
            // Someone want to Buy = B => A so WE sell A and get B
            assert.ok(checkIfTradeIsOk(
                true,
                new BigNumber(100),
                new BigNumber(1000),
                new BigNumber(3),
                new BigNumber(0.5),
                new BigNumber(2),
                new BigNumber(100),
                new BigNumber(200),
                new BigNumber(10),
                new BigNumber(20*1.0107),
                new BigNumber(0)))

            // Someone want to Sell = A => B so WE sell B and get A
            assert.ok(checkIfTradeIsOk(
                false,
                new BigNumber(100),
                new BigNumber(1000),
                new BigNumber(3),
                new BigNumber(0.5),
                new BigNumber(2),
                new BigNumber(100),
                new BigNumber(200),
                new BigNumber(10),
                new BigNumber(20*1.0106),
                new BigNumber(0)))
        })
        it('Two small buy should be cheaper than on big buy', () => {
            // Someone want to Buy = 20 B => 20 A so WE sell 20 A and get 20 B
            const oneBigPrice = 1.015496477811121
            assert.ok(checkIfTradeIsOk(
                true,
                new BigNumber(100),
                new BigNumber(1000),
                new BigNumber(3),
                new BigNumber(0.5),
                new BigNumber(1),
                new BigNumber(100),
                new BigNumber(100),
                new BigNumber(20),
                new BigNumber(20 * oneBigPrice),
                new BigNumber(0)))

            // Someone want to 2x Buy = 10 B => 10 A so WE sell 10 A and get 10 B
            const firstPrice = 1.010633730608657
            assert.ok(checkIfTradeIsOk(
                true,
                new BigNumber(100),
                new BigNumber(1000),
                new BigNumber(3),
                new BigNumber(0.5),
                new BigNumber(1),
                new BigNumber(100),
                new BigNumber(100),
                new BigNumber(10),
                new BigNumber(10 * firstPrice),
                new BigNumber(0)))
            const secondPrice = 1.0154876834556
            assert.ok(checkIfTradeIsOk(
                true,
                new BigNumber(100),
                new BigNumber(1000),
                new BigNumber(3),
                new BigNumber(0.5),
                new BigNumber(1),
                new BigNumber(100 - 10),
                new BigNumber(100 + (10 * firstPrice)),
                new BigNumber(10),
                new BigNumber(10 * secondPrice),
                new BigNumber(0)))
            assert.ok((10 * firstPrice) + (10 * secondPrice) < 20 * oneBigPrice)
        })
        it('Buy/sell 1 fee should return true', () => {
            // Someone want to Buy = B => A so WE sell A and get B
            assert.ok(checkIfTradeIsOk(
                true,
                new BigNumber(100),
                new BigNumber(1000),
                new BigNumber(3),
                new BigNumber(0.5),
                new BigNumber(2),
                new BigNumber(100),
                new BigNumber(200),
                new BigNumber(10),
                new BigNumber((20*1.0107) + 1),
                new BigNumber(1)))

            // Someone want to Sell = A => B so WE sell B and get A
            assert.ok(checkIfTradeIsOk(
                false,
                new BigNumber(100),
                new BigNumber(1000),
                new BigNumber(3),
                new BigNumber(0.5),
                new BigNumber(2),
                new BigNumber(100),
                new BigNumber(200),
                new BigNumber(11),
                new BigNumber(20*1.0106),
                new BigNumber(1)))

        })
        it('Buy/sell fee + imbalance should return true', () => {
            // Someone want to Buy = B => A so WE sell A and get B
            assert.ok(checkIfTradeIsOk(
                true,
                new BigNumber(100),
                new BigNumber(1000),
                new BigNumber(3),
                new BigNumber(0.5),
                new BigNumber(1),
                new BigNumber(2000),
                new BigNumber(200),
                new BigNumber(10),
                new BigNumber(11.1),
                new BigNumber(1)))

            // Someone want to Sell = A => B so WE sell B and get A
            assert.ok(checkIfTradeIsOk(
                false,
                new BigNumber(100),
                new BigNumber(1000),
                new BigNumber(3),
                new BigNumber(0.5),
                new BigNumber(1),
                new BigNumber(2000),
                new BigNumber(200),
                new BigNumber(11),
                new BigNumber(10 * 1.0681),
                new BigNumber(1)))
        })
        it('Buy/sell fee + imbalance over price should return true', () => {
            // Someone want to Buy = B => A so WE sell A and get B
            assert.ok(checkIfTradeIsOk(
                true,
                new BigNumber(100),
                new BigNumber(1000),
                new BigNumber(3),
                new BigNumber(0.5),
                new BigNumber(1),
                new BigNumber(2000),
                new BigNumber(200),
                new BigNumber(10),
                new BigNumber(12.1),
                new BigNumber(1)))

            // Someone want to Sell = A => B so WE sell B and get A
            assert.ok(checkIfTradeIsOk(
                false,
                new BigNumber(100),
                new BigNumber(1000),
                new BigNumber(3),
                new BigNumber(0.5),
                new BigNumber(1),
                new BigNumber(2000),
                new BigNumber(200),
                new BigNumber(12),
                new BigNumber(10 * 1.0681),
                new BigNumber(1)))
        })
        it('Buy/sell fee + imbalance under price should return false', () => {
            // Someone want to Buy = B => A so WE sell A and get B
            assert.ok(!checkIfTradeIsOk(
                true,
                new BigNumber(100),
                new BigNumber(1000),
                new BigNumber(3),
                new BigNumber(0.5),
                new BigNumber(1),
                new BigNumber(2000),
                new BigNumber(200),
                new BigNumber(10),
                new BigNumber(11.09),
                new BigNumber(1)))

            // Someone want to Sell = A => B so WE sell B and get A
            assert.ok(!checkIfTradeIsOk(
                false,
                new BigNumber(100),
                new BigNumber(1000),
                new BigNumber(3),
                new BigNumber(0.5),
                new BigNumber(1),
                new BigNumber(2000),
                new BigNumber(200),
                new BigNumber(10.9),
                new BigNumber(10 * 1.0681),
                new BigNumber(1)))
        })
        it('Someone want to buy more than we have should return false', () => {
            // Someone want to Buy = B => A so WE sell A and get B
            assert.ok(!checkIfTradeIsOk(
                true,
                new BigNumber(100),
                new BigNumber(1000),
                new BigNumber(3),
                new BigNumber(0.5),
                new BigNumber(2),
                new BigNumber(1),
                new BigNumber(2),
                new BigNumber(10),
                new BigNumber(20*1.0107),
                new BigNumber(0)))

                // Someone want to Sell = A => B so WE sell B and get A
                assert.ok(!checkIfTradeIsOk(
                    false,
                    new BigNumber(100),
                    new BigNumber(1000),
                    new BigNumber(3),
                    new BigNumber(0.5),
                    new BigNumber(2),
                    new BigNumber(1),
                    new BigNumber(2),
                    new BigNumber(10),
                    new BigNumber(20*1.0106),
                    new BigNumber(0)))
        })
    })
})