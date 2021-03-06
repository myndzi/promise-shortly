'use strict';

var TokenBucket = require('simple-token-bucket'),
    PriorityDeque = require('priority-deque').PriorityDeque,
    createError = require('create-error');

var OverflowError = createError('BucketOverflowError');

function cmp(a, b) {
    // higher priority wins
    if (a.priority > b.priority) { return -1; }
    if (a.priority < b.priority) { return 1; }

    // fewer tokens wins
    if (a.tokens < b.tokens) { return -1; }
    if (a.tokens > b.tokens) { return 1; }

    return 0;
}

function QueuedPromise(priority, tokens, resolve, reject) {
    this.priority = priority;
    this.tokens = tokens;
    this.resolve = resolve;
    this.reject = reject;
}

function Shortly(bucketOpts, _opts) {
    // retain compatibility with old constructor
    var opts = (
        typeof _opts === 'function' ?
            { Promise: _opts } :
            (_opts || { })
    );

    if (Object.prototype.hasOwnProperty.call(opts, 'Promise')) {
        this.PromiseImpl = opts.Promise;
    } else {
        this.PromiseImpl = Promise;
    }

    if (typeof this.PromiseImpl !== 'function') {
        throw new TypeError('Promise is not a function');
    }

    this.bucket = new TokenBucket(bucketOpts);
    this.limit = typeof opts.limit === 'number' ? opts.limit : Infinity;

    this.heap = new PriorityDeque({ compare: cmp });
    this.timer = null;

    this._tryPop = this._tryPop.bind(this);
    this.wait = this.wait.bind(this);
}

Shortly.OverflowError = OverflowError;

Shortly.prototype._tryPop = function () {
    if (this.timer !== null) {
        clearTimeout(this.timer);
        this.timer = null;
    }

    var candidate, timeToWait, heap = this.heap, bucket = this.bucket;

    // try to consume as many items on the heap as possible
    while (heap.length > 0) {
        candidate = heap.findMin();
        timeToWait = bucket.take(candidate.tokens);

        if (timeToWait > 0) {
            // rate-limited, finish and delay
            this.timer = setTimeout(this._tryPop, timeToWait);
            break;
        }

        // actually pop the next item and resolve the promise
        heap.pop().resolve();
    }

    while (heap.length > this.limit) {
        heap.shift().reject(new OverflowError('Capacity exceeded'));
    }
};

Shortly.prototype.wait = function (_priority, _tokens) {
    var priority = Number(_priority),
        tokens = parseInt(_tokens, 10),
        heap = this.heap;

    // defaults
    if (isNaN(priority)) {
        priority = 1;
    }
    if (isNaN(tokens) || !isFinite(tokens) || tokens <= 0 || tokens !== _tokens) {
        tokens = 1;
    }

    var promise = new this.PromiseImpl(function (resolve, reject) {
        heap.push(new QueuedPromise(priority, tokens, resolve, reject));
    });

    // we may or may not already be delaying, but the top of the heap
    // might now be different, and it might have an acceptable number
    // of tokens, so we should try to accept the top of the heap each
    // time we get here

    this._tryPop();

    return promise;
};

module.exports = Shortly;