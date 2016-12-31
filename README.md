# promise-shortly

Install:
```
$ npm install --save promise-shortrly
```

Example:
```js
var Shortly = require('promise-shortly'),
	Bluebird = require('bluebird');

var wait = new Shortly({
	capacity: 10,
    fillQuantity: 1,
    fillTime: 1000,
    initialCapacity: 1
}, Bluebird).wait;

var start = Date.now();
function numSeconds() {
	return Math.round((Date.now() - start) / 1000);
}

wait().then(function () {
    console.log('default, completed after '+numSeconds()+'s');
});

wait(0, 3).then(function () {
	console.log('low priority, completed after '+numSeconds()+'s');
});

wait(10, 1).then(function () {
	console.log('high priority, completed after '+numSeconds()+'s');
});
```

Output:
```
default, completed after 0s
high priority, completed after 1s
low priority, completed after 4s
```

## API

### Constructor
`new Shortly(tokenBucketOptions[, PromiseImplementation])`
Options for the token bucket are passed directly to [simple-token-bucket#options](https://www.npmjs.com/package/simple-token-bucket#options), so this document is not authoritative, but I will list the current options here for convenience:

* **capacity**: the capacity of the token bucket, aka burstiness
* **fillQuantity**: how many tokens to add when filling
* **fillTime**: how much time it takes to add fillQuantity tokens
* **initialCapacity**: the bucket initializes to max capacity by default, but you can optionally change it here

`fillQuantity` and `fillTime` combined create a rate which is used to calculate both how many tokens to add at any given moment and how much time remains before a request can be fulfilled. I chose this approach since most of the time it's desirable to specify a rate limit in "X's per Y".

### #wait
`shortly.wait([priority, [tokens]])`
Arguments are optional. Requests are sorted by priority first and tokens second. *High* priority values trump low priority values, while *low* token counts trump *high* token counts. Priority only affects queueing, so a low priority request may execute while a high priority request gets queued, *if* the low priority request can be executed immediately.

## What
`promise-shortly` is a promise-based rate limiter with prioritization and a simple API. You set it up, then any time you want to wait on the rate limit, just call `wait()`. It allows for prioritization so that certain promises can jump the queue, and you may specify the "weight" of a request in tokens, which has two effects:
1. Requests with fewer tokens will be resolved first is the same priority class
2. Requests specifying other than the default 1 token will cause that amount of tokens to be removed from the backing token bucket implementation; in effect, a request of 3 tokens will take 3 times as long to recover from than a request of 1 token.

## How
`promise-shortly` utilizes [simple-token-bucket](https://www.npmjs.com/package/simple-token-bucket) and [heap](https://www.npmjs.com/package/heap) and ties them together to provide a convenient API. The token bucket guides whether a request can be satisfied; if it cannot, a timeout is utilized to resolve it at the first opportunity. New requests may alter this, of course.

## Why
`promise-shortly` provides a simple API that doesn't rely on coupling its implementation with yours. Anywhere you can resolve a promise, you can delay based on a rate limit.

