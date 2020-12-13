'use strict';

var sinon = require('sinon'),
    should = require('should');

var Shortly = require('./index'),
    Bluebird = require('bluebird');

function delay(n) {
    return new Promise(function (resolve) {
        setTimeout(resolve, n);
    });
}

var OPTS = {
    capacity: 10,
    fillQuantity: 1,
    fillTime: 1000,
    initialCapacity: 0
};

describe('Shortly', function () {
    describe('constructor', function () {
        it('should accept a custom Promise constructor', function (done) {
            new Shortly(OPTS, function () { done(); }).wait();
        });
        it('should accept a custom Promise constructor as an options object', function (done) {
            new Shortly(OPTS, { Promise: function () { done(); } }).wait();
        });
        it('should throw if Promise is not a function', function () {
            (function () {
                new Shortly(OPTS, {Promise: 'foo'});
            }).should.throw(TypeError, /Promise is not a function/);
        });
    });

    ['default', 'Promise', 'Bluebird'].forEach(function (PromiseImpl) {
        describe('('+PromiseImpl+')', function () {
            describe('#wait', function () {
                this.timeout(50);

                var clock, wait;
                before(function () { clock = sinon.useFakeTimers(); });
                after(function () { clock.restore(); });

                beforeEach(function () {
                    switch (PromiseImpl) {
                        case 'default':
                            wait = new Shortly(OPTS).wait;
                            break;
                        case 'Promise':
                            wait = new Shortly(OPTS, Promise).wait;
                            break;
                        case 'Bluebird':
                            wait = new Shortly(OPTS, Bluebird).wait;
                            break;
                        default:
                            throw new Error('Unknown promise implementation: '+PromiseImpl);
                    }
                });

                it('should resolve immediately if there is capacity', function () {
                    clock.tick(1000);
                    return wait();
                });

                it('should not resolve if there is not capacity', function (done) {
                    var completed = false;

                    Promise.race([
                        wait(),
                        delay(1)
                    ]).then(function () {
                        completed.should.equal(false);
                        done();
                    });

                    clock.tick(1);
                });

                it('should wait for capacity then resolve', function (done) {
                    wait().then(done);
                    clock.tick(1000);
                });

                it('should allow higher priority requests to complete first when waiting (1)', function (done) {
                    Promise.race([
                        wait(0).then(function () { return 'low priority'; }),
                        wait(100).then(function () { return 'high priority'; })
                    ]).then(function (result) {
                        result.should.equal('high priority');
                        done();
                    }).catch(done);

                    clock.tick(1000);
                });

                it('should allow higher priority requests to complete first when waiting (2)', function (done) {
                    Promise.race([
                        wait(100).then(function () { return 'high priority'; }),
                        wait(0).then(function () { return 'low priority'; })
                    ]).then(function (result) {
                        result.should.equal('high priority');
                        done();
                    }).catch(done);

                    clock.tick(1000);
                });

                it('should be first come, first served when not waiting (1)', function (done) {
                    clock.tick(1000);

                    Promise.race([
                        wait(0).then(function () { return 'low priority'; }),
                        wait(100).then(function () { return 'high priority'; })
                    ]).then(function (result) {
                        result.should.equal('low priority');
                        done();
                    }).catch(done);
                });

                it('should be first come, first served when not waiting (2)', function (done) {
                    clock.tick(1000);

                    Promise.race([
                        wait(100).then(function () { return 'high priority'; }),
                        wait(0).then(function () { return 'low priority'; })
                    ]).then(function (result) {
                        result.should.equal('high priority');
                        done();
                    }).catch(done);
                });

                it('should complete lower-token requests first when waiting and priority is equal (1)', function (done) {
                    Promise.race([
                        wait(0, 5).then(function () { return 'many tokens'; }),
                        wait(0, 1).then(function () { return 'few tokens'; })
                    ]).then(function (result) {
                        result.should.equal('few tokens');
                        done();
                    }).catch(done);

                    clock.tick(1000);
                });

                it('should complete lower-token requests first when waiting and priority is equal (2)', function (done) {
                    Promise.race([
                        wait(0, 1).then(function () { return 'few tokens'; }),
                        wait(0, 5).then(function () { return 'many tokens'; })
                    ]).then(function (result) {
                        result.should.equal('few tokens');
                        done();
                    }).catch(done);

                    clock.tick(1000);
                });

                it('should complete lower-token requests when already waiting on a higher-token request', function (done) {
                    clock.tick(1000);

                    Promise.race([
                        wait(0, 5).then(function () { return 'many tokens'; }),
                        wait(0, 1).then(function () { return 'few tokens'; })
                    ]).then(function (result) {
                        result.should.equal('few tokens');
                        done();
                    }).catch(done);
                });

                it('should be first come, first served when not waiting (3)', function (done) {
                    clock.tick(10000);

                    Promise.race([
                        wait(0, 1).then(function () { return 'few tokens'; }),
                        wait(0, 5).then(function () { return 'many tokens'; })
                    ]).then(function (result) {
                        result.should.equal('few tokens');
                        done();
                    }).catch(done);
                });

                it('should be first come, first served when not waiting (4)', function (done) {
                    clock.tick(10000);

                    Promise.race([
                        wait(0, 5).then(function () { return 'many tokens'; }),
                        wait(0, 1).then(function () { return 'few tokens'; })
                    ]).then(function (result) {
                        result.should.equal('many tokens');
                        done();
                    }).catch(done);
                });

                it('should respect priority before token count (1)', function (done) {
                    Promise.race([
                        wait(0, 1).then(function () { return 'low priority'; }),
                        wait(100, 10).then(function () { return 'high priority'; })
                    ]).then(function (result) {
                        result.should.equal('high priority');
                        done();
                    }).catch(done);

                    clock.tick(10000);
                });

                it('should respect priority before token count (1)', function (done) {
                    Promise.race([
                        wait(100, 10).then(function () { return 'high priority'; }),
                        wait(0, 1).then(function () { return 'low priority'; })
                    ]).then(function (result) {
                        result.should.equal('high priority');
                        done();
                    }).catch(done);

                    clock.tick(10000);
                });
            });
        });
    });

    describe('with limit option', function () {
        this.timeout(50);
        var clock;

        before(function () { clock = sinon.useFakeTimers(); });
        after(function () { clock.restore(); });

        it('should reject lowest-priority item when limit is exceeded (1)', function (done) {
            var wait = new Shortly({
                capacity: 1,
                fillQuantity: 1,
                fillTime: 1000,
                initialCapacity: 0
            }, {
                Promise: Bluebird,
                limit: 1
            }).wait;

            Promise.all([
                wait(0).should.be.rejectedWith(Shortly.OverflowError),
                wait(100).should.be.resolved(),
            ]).then(function () { done(); }).catch(done);

            clock.tick(1000);
        });

        it('should reject lowest-priority item when limit is exceeded (1)', function (done) {
            var wait = new Shortly({
                capacity: 1,
                fillQuantity: 1,
                fillTime: 1000,
                initialCapacity: 0
            }, {
                Promise: Bluebird,
                limit: 1
            }).wait;

            Promise.all([
                wait(100).should.be.resolved(),
                wait(0).should.be.rejectedWith(Shortly.OverflowError),
            ]).then(function () { done(); }).catch(done);

            clock.tick(1000);
        });
    });
});