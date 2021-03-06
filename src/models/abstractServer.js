'use strict';

var Q = require('q'),
    util = require('util'),
    ScopedLogger = require('../util/scopedLogger'),
    helpers = require('../util/helpers'),
    Domain = require('domain'),
    errors = require('../util/errors');

function implement (implementation, baseLogger) {

    function create (options) {
        function scopeFor (port) {
            var scope = util.format('%s:%s', implementation.protocolName, port);
            if (options.name) {
                scope += ' ' + options.name;
            }
            return scope;
        }

        var deferred = Q.defer(),
            requests = [],
            logger = ScopedLogger.create(baseLogger, scopeFor(options.port)),
            server = implementation.createServer(logger, options);

        server.on('connection', function (socket) {
            var name = helpers.socketName(socket);

            logger.debug('%s ESTABLISHED', name);

            socket.on('error', function (error) {
                logger.error('%s transmission error X=> %s', name, JSON.stringify(error));
            });

            socket.on('end', function () { logger.debug('%s LAST-ACK', name); });
            socket.on('close', function () { logger.debug('%s CLOSED', name); });
        });

        server.on('request', function (socket, request, testCallback) {
            var domain = Domain.create(),
                clientName = helpers.socketName(socket),
                errorHandler = function (error) {
                    logger.error('%s X=> %s', clientName, JSON.stringify(errors.details(error)));
                    server.errorHandler(errors.details(error), request);
                    if (testCallback) {
                        testCallback();
                    }
                };

            logger.info('%s => %s', clientName, server.formatRequestShort(request));

            domain.on('error', errorHandler);
            domain.run(function () {
                implementation.Request.createFrom(request).then(function (simpleRequest) {
                    logger.debug('%s => %s', clientName, JSON.stringify(server.formatRequest(simpleRequest)));
                    requests.push(simpleRequest);
                    return server.respond(simpleRequest, request);
                }).done(function (response) {
                    if (response) {
                        logger.debug('%s <= %s', clientName, JSON.stringify(server.formatResponse(response)));
                    }
                    if (testCallback) {
                        testCallback();
                    }
                }, errorHandler);
            });
        });

        server.listen(options.port || 0).done(function (actualPort) {
            var metadata = server.metadata(options);
            if (options.name) {
                metadata.name = options.name;
            }

            if (options.port !== actualPort) {
                logger.changeScope(scopeFor(actualPort));
            }

            logger.info('Open for business...');

            deferred.resolve({
                requests: requests,
                addStub: server.addStub,
                stubs: server.stubs,
                metadata: metadata,
                port: actualPort,
                close: function () {
                    server.close(function () { logger.info ('Ciao for now'); });
                }
            });
        });

        return deferred.promise;
    }

    return {
        create: create
    };
}

module.exports = {
    implement: implement
};
