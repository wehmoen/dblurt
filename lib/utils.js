"use strict";
/**
 * @file Misc utility functions.
 * @author Johan Nordberg <code@johan-nordberg.com>
 * @license
 * Copyright (c) 2017 Johan Nordberg. All Rights Reserved.
 *
 * Redistribution and use in source and binary forms, with or without modification,
 * are permitted provided that the following conditions are met:
 *
 *  1. Redistribution of source code must retain the above copyright notice, this
 *     list of conditions and the following disclaimer.
 *
 *  2. Redistribution in binary form must reproduce the above copyright notice,
 *     this list of conditions and the following disclaimer in the documentation
 *     and/or other materials provided with the distribution.
 *
 *  3. Neither the name of the copyright holder nor the names of its contributors
 *     may be used to endorse or promote products derived from this software without
 *     specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED.
 * IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT,
 * INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING,
 * BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
 * LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE
 * OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED
 * OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 * You acknowledge that this software is not designed, licensed or intended for use
 * in the design, construction, operation or maintenance of any military facility.
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeBitMaskFilter = exports.operationOrders = exports.buildWitnessUpdateOp = exports.retryingFetch = exports.copy = exports.iteratorStream = exports.sleep = exports.waitForEvent = void 0;
const cross_fetch_1 = require("cross-fetch");
const stream_1 = require("stream");
// TODO: Add more errors that should trigger a failover
const timeoutErrors = ['timeout', 'ENOTFOUND', 'ECONNREFUSED', 'database lock'];
/**
 * Return a promise that will resove when a specific event is emitted.
 */
function waitForEvent(emitter, eventName) {
    return new Promise((resolve, reject) => {
        emitter.once(eventName, resolve);
    });
}
exports.waitForEvent = waitForEvent;
/**
 * Sleep for N milliseconds.
 */
function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
exports.sleep = sleep;
/**
 * Return a stream that emits iterator values.
 */
function iteratorStream(iterator) {
    const stream = new stream_1.PassThrough({ objectMode: true });
    const iterate = () => __awaiter(this, void 0, void 0, function* () {
        var e_1, _a;
        try {
            for (var iterator_1 = __asyncValues(iterator), iterator_1_1; iterator_1_1 = yield iterator_1.next(), !iterator_1_1.done;) {
                const item = iterator_1_1.value;
                if (!stream.write(item)) {
                    yield waitForEvent(stream, 'drain');
                }
            }
        }
        catch (e_1_1) { e_1 = { error: e_1_1 }; }
        finally {
            try {
                if (iterator_1_1 && !iterator_1_1.done && (_a = iterator_1.return)) yield _a.call(iterator_1);
            }
            finally { if (e_1) throw e_1.error; }
        }
    });
    iterate()
        .then(() => {
        stream.end();
    })
        .catch((error) => {
        stream.emit('error', error);
        stream.end();
    });
    return stream;
}
exports.iteratorStream = iteratorStream;
/**
 * Return a deep copy of a JSON-serializable object.
 */
function copy(object) {
    return JSON.parse(JSON.stringify(object));
}
exports.copy = copy;
/**
 * Fetch API wrapper that retries until timeout is reached.
 */
function retryingFetch(currentAddress, allAddresses, opts, timeout, failoverThreshold, consoleOnFailover, backoff, fetchTimeout) {
    return __awaiter(this, void 0, void 0, function* () {
        let start = Date.now();
        let tries = 0;
        let round = 0;
        do {
            try {
                if (fetchTimeout) {
                    opts.timeout = fetchTimeout(tries);
                }
                const response = yield cross_fetch_1.default(currentAddress, opts);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                return { response: yield response.json(), currentAddress };
            }
            catch (error) {
                if (timeout !== 0 && Date.now() - start > timeout) {
                    if ((!error || !error.code) && Array.isArray(allAddresses)) {
                        // If error is empty or not code is present, it means rpc is down => switch
                        currentAddress = failover(currentAddress, allAddresses, currentAddress, consoleOnFailover);
                    }
                    else {
                        const isFailoverError = timeoutErrors.filter((fe) => error && error.code && error.code.includes(fe)).length > 0;
                        if (isFailoverError &&
                            Array.isArray(allAddresses) &&
                            allAddresses.length > 1) {
                            if (round < failoverThreshold) {
                                start = Date.now();
                                tries = -1;
                                if (failoverThreshold > 0) {
                                    round++;
                                }
                                currentAddress = failover(currentAddress, allAddresses, currentAddress, consoleOnFailover);
                            }
                            else {
                                error.message = `[${error.code}] tried ${failoverThreshold} times with ${allAddresses.join(',')}`;
                                throw error;
                            }
                        }
                        else {
                            // tslint:disable-next-line: no-console
                            console.error(`Didn't failover for error ${error.code ? 'code' : 'message'}: [${error.code || error.message}]`);
                            throw error;
                        }
                    }
                }
                yield sleep(backoff(tries++));
            }
        } while (true);
    });
}
exports.retryingFetch = retryingFetch;
const failover = (url, urls, currentAddress, consoleOnFailover) => {
    const index = urls.indexOf(url);
    const targetUrl = urls.length === index + 1 ? urls[0] : urls[index + 1];
    if (consoleOnFailover) {
        // tslint:disable-next-line: no-console
        console.log(`Switched Hive RPC: ${targetUrl} (previous: ${currentAddress})`);
    }
    return targetUrl;
};
// Hack to be able to generate a valid witness_set_properties op
// Can hopefully be removed when hived's JSON representation is fixed
const ByteBuffer = require("bytebuffer");
const serializer_1 = require("./chain/serializer");
function serialize(serializer, data) {
    const buffer = new ByteBuffer(ByteBuffer.DEFAULT_CAPACITY, ByteBuffer.LITTLE_ENDIAN);
    serializer(buffer, data);
    buffer.flip();
    // `props` values must be hex
    return buffer.toString('hex');
    // return Buffer.from(buffer.toBuffer());
}
function buildWitnessUpdateOp(owner, props) {
    const data = {
        extensions: [],
        owner,
        props: []
    };
    for (const key of Object.keys(props)) {
        let type;
        switch (key) {
            case 'key':
            case 'new_signing_key':
                type = serializer_1.Types.PublicKey;
                break;
            case 'account_subsidy_budget':
            case 'account_subsidy_decay':
            case 'maximum_block_size':
                type = serializer_1.Types.UInt32;
                break;
            case 'hbd_interest_rate':
                type = serializer_1.Types.UInt16;
                break;
            case 'url':
                type = serializer_1.Types.String;
                break;
            case 'hbd_exchange_rate':
                type = serializer_1.Types.Price;
                break;
            case 'account_creation_fee':
                type = serializer_1.Types.Asset;
                break;
            default:
                throw new Error(`Unknown witness prop: ${key}`);
        }
        data.props.push([key, serialize(type, props[key])]);
    }
    data.props.sort((a, b) => a[0].localeCompare(b[0]));
    return ['witness_set_properties', data];
}
exports.buildWitnessUpdateOp = buildWitnessUpdateOp;
const JSBI = require('jsbi');
exports.operationOrders = {
    vote: 0,
    // tslint:disable-next-line: object-literal-sort-keys
    comment: 1,
    transfer: 2,
    transfer_to_vesting: 3,
    withdraw_vesting: 4,
    limit_order_create: 5,
    limit_order_cancel: 6,
    feed_publish: 7,
    convert: 8,
    account_create: 9,
    account_update: 10,
    witness_update: 11,
    account_witness_vote: 12,
    account_witness_proxy: 13,
    pow: 14,
    custom: 15,
    report_over_production: 16,
    delete_comment: 17,
    custom_json: 18,
    comment_options: 19,
    set_withdraw_vesting_route: 20,
    limit_order_create2: 21,
    claim_account: 22,
    create_claimed_account: 23,
    request_account_recovery: 24,
    recover_account: 25,
    change_recovery_account: 26,
    escrow_transfer: 27,
    escrow_dispute: 28,
    escrow_release: 29,
    pow2: 30,
    escrow_approve: 31,
    transfer_to_savings: 32,
    transfer_from_savings: 33,
    cancel_transfer_from_savings: 34,
    custom_binary: 35,
    decline_voting_rights: 36,
    reset_account: 37,
    set_reset_account: 38,
    claim_reward_balance: 39,
    delegate_vesting_shares: 40,
    account_create_with_delegation: 41,
    witness_set_properties: 42,
    account_update2: 43,
    create_proposal: 44,
    update_proposal_votes: 45,
    remove_proposal: 46,
    update_proposal: 47,
    fill_convert_request: 48,
    author_reward: 49,
    curation_reward: 50,
    comment_reward: 51,
    liquidity_reward: 52,
    interest: 53,
    fill_vesting_withdraw: 54,
    fill_order: 55,
    shutdown_witness: 56,
    fill_transfer_from_savings: 57,
    hardfork: 58,
    comment_payout_update: 59,
    return_vesting_delegation: 60,
    comment_benefactor_reward: 61,
    producer_reward: 62,
    clear_null_account_balance: 63,
    proposal_pay: 64,
    sps_fund: 65,
    hardfork_hive: 66,
    hardfork_hive_restore: 67,
    delayed_voting: 68,
    consolidate_treasury_balance: 69,
    effective_comment_vote: 70,
    ineffective_delete_comment: 71,
    sps_convert: 72
};
/**
 * Make bitmask filter to be used with getAccountHistory call
 * @param allowedOperations Array of operations index numbers
 */
function makeBitMaskFilter(allowedOperations) {
    return allowedOperations
        .reduce(redFunction, [JSBI.BigInt(0), JSBI.BigInt(0)])
        .map((value) => JSBI.notEqual(value, JSBI.BigInt(0)) ? value.toString() : null);
}
exports.makeBitMaskFilter = makeBitMaskFilter;
const redFunction = ([low, high], allowedOperation) => {
    if (allowedOperation < 64) {
        return [
            JSBI.bitwiseOr(low, JSBI.leftShift(JSBI.BigInt(1), JSBI.BigInt(allowedOperation))),
            high
        ];
    }
    else {
        return [
            low,
            JSBI.bitwiseOr(high, JSBI.leftShift(JSBI.BigInt(1), JSBI.BigInt(allowedOperation - 64)))
        ];
    }
};
