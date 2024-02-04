import type { BucketOptions } from 'simple-token-bucket';

import { TokenBucket } from 'simple-token-bucket';
import { PriorityQueue } from '@datastructures-js/priority-queue';

export class BucketOverflowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export type ShortlyOptions = {
  limit?: number;
};

type Mutable<T> = { -readonly [K in keyof T]: T[K] };
class QueuedPromise {
  readonly priority: number;
  readonly tokens: number;
  // @ts-ignore
  readonly resolve: (value: void | PromiseLike<void>) => void;
  // @ts-ignore
  readonly reject: (reason?: any) => void;
  readonly promise: Promise<void>;
  constructor(priority: number, tokens: number) {
    const self = this as Mutable<InstanceType<typeof QueuedPromise>>;
    this.priority = priority;
    this.tokens = tokens;
    this.promise = new Promise<void>((resolve, reject) => {
      self.resolve = resolve;
      self.reject = reject;
    });
  }
}

const validPriority = (v: any): number | undefined => {
  const num = Number(v);
  return !Number.isNaN(num) && Number.isFinite(num) ? num : undefined;
};
const validTokens = (v: any): number | undefined => {
  const num = Number(v);
  return !Number.isNaN(num) && Number.isFinite(num) && Number.isInteger(num) && num > 0 ? num : undefined;
};

// prettier-ignore
const compare = (a: QueuedPromise, b: QueuedPromise) =>
  (a.priority !== b.priority
    ? b.priority - a.priority
    : a.tokens - b.tokens);

export type EnqueueOptions = {
  priority?: number;
  tokens?: number;
};
export class Shortly {
  private bucket: TokenBucket;
  private limit: number;
  private heap: PriorityQueue<QueuedPromise>;
  private timer: NodeJS.Timeout | undefined;
  readonly wait: (opts?: EnqueueOptions) => Promise<void>;
  private _tryPop: InstanceType<typeof Shortly>['__tryPop'];

  constructor(bucketOpts: BucketOptions, shortlyOpts?: ShortlyOptions) {
    this.bucket = new TokenBucket(bucketOpts);
    this.limit = shortlyOpts?.limit ?? Infinity;
    this.heap = new PriorityQueue<QueuedPromise>(compare);
    this.timer = undefined;
    this.wait = (opts: EnqueueOptions = {}) => this._wait(opts);
    this._tryPop = () => this.__tryPop();
  }

  private __tryPop() {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }

    for (let items = this.heap.size(); items > 0; items--) {
      // peek the next item
      const candidate = this.heap.front();
      // see if we can consume it
      const timeToWait = this.bucket.take(candidate.tokens);
      if (timeToWait > 0) {
        // we must wait - come back later
        this.timer = setTimeout(this._tryPop, timeToWait);
        break;
      }

      // actually dequeue the pending promise and resolve it
      this.heap.dequeue().resolve();
    }
  }

  private _wait(opts: EnqueueOptions): Promise<void> {
    const priority = validPriority(opts.priority) ?? 1;
    const tokens = validTokens(opts.tokens) ?? 1;

    // enqueue a new promise
    const qp = new QueuedPromise(priority, tokens);
    this.heap.push(qp);

    // check limit
    if (this.heap.size() > this.limit) {
      // datastructures-js lets us peek the back but not remove it directly, unfortunately
      const back = this.heap.back();
      this.heap.remove(v => v === back);
      back.reject(new BucketOverflowError('Queue is full'));
    }

    // attempt to flush from queue
    this.__tryPop();

    return qp.promise;
  }
}
