# promise-shortly

Typescript utility library to create promises that resolve according to a rate limit.

Install:
```
$ npm install --save promise-shortly
```

Example:
```js
import { Shortly } from "promise-shortly";

const wait = new Shortly(
  {
    capacity: 10,
    fillQuantity: 1,
    fillTime: 1000,
    initialCapacity: 1,
  },
  {
    limit: 2,
  }
).wait;

const start = Date.now();
const numSeconds = () => Math.round((Date.now() - start) / 1000);

wait().then(() => {
  console.log("default, completed after " + numSeconds() + "s");
});

wait({ priority: 0 }).catch(() => {
  console.log("low priority, rejected (over limit)");
});

wait({ priority: 5, tokens: 3 }).then(() => {
  console.log("middle priority, completed after " + numSeconds() + "s");
});

wait({ priority: 10, tokens: 1 }).then(() => {
  console.log("high priority, completed after " + numSeconds() + "s");
});
```

Output:
```
default, completed after 0s
low priority, rejected (over limit)
high priority, completed after 1s
middle priority, completed after 4s
```

## API

### Constructor
`new Shortly(tokenBucketOptions[, shortlyOptions])`

#### tokenBucketOptions
Options for the token bucket are passed directly to [simple-token-bucket#options](https://www.npmjs.com/package/simple-token-bucket#options), so this document is not authoritative, but I will list the current options here for convenience:

* **capacity**: the capacity of the token bucket, aka burstiness
* **fillQuantity**: how many tokens to add when filling
* **fillTime**: how much time it takes to add fillQuantity tokens
* **initialCapacity**: the bucket initializes to max capacity by default, but you can optionally change it here

`fillQuantity` and `fillTime` combined create a rate which is used to calculate both how many tokens to add at any given moment and how much time remains before a request can be fulfilled. I chose this approach since most of the time it's desirable to specify a rate limit in "X's per Y".

#### shortlyOptions
* **limit**: the maximum number of items to enqueue. If the limit is exceeded, low priority items will be rejected with a `BucketOverflowError`.

### #wait
`shortly.wait({priority: number, tokens: number})`
Arguments are optional. Requests are sorted by priority first and tokens second. *High* priority values trump low priority values, while *low* token counts trump *high* token counts.

## What
`promise-shortly` is a promise-based rate limiter with prioritization and a simple API. You set it up, then any time you want to wait on the rate limit, just call `wait()`. It allows for prioritization so that certain promises can jump the queue, and you may specify the "weight" of a request in tokens, which has two effects:
1. Requests with fewer tokens will be resolved first in the same priority class
2. Requests specifying other than the default 1 token will cause that amount of tokens to be removed from the backing token bucket implementation; in effect, a request of 3 tokens will take 3 times as long to recover from than a request of 1 token.

## How
`promise-shortly` utilizes [simple-token-bucket](https://www.npmjs.com/package/simple-token-bucket) and [@datastructures-js/priority-queue](https://www.npmjs.com/package/@datastructures-js/priority-queue) and ties them together to provide a convenient API. The token bucket guides whether a request can be satisfied; if it cannot, a timeout is utilized to resolve it at the first opportunity. New requests may alter this, of course.

## Why
`promise-shortly` provides a simple API that doesn't rely on coupling its implementation with yours. Anywhere you can resolve a promise, you can delay based on a rate limit.

