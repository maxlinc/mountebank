'use strict';

var Validator = require('../util/validator'),
    Q = require('q'),
    helpers = require('../util/helpers'),
    errors = require('../util/errors');

function create (protocols, imposters, Imposter, logger) {

    function createValidator (request) {
        var protocol = request.protocol,
            port = request.port,
            Protocol = protocols[protocol],
            protocolSupport = {},
            validator;

        protocolSupport[protocol] = Protocol;
        validator = Validator.create({
            requiredFields: { protocol: protocol },
            requireValidPorts: { port: port },
            requireProtocolSupport: protocolSupport
        });

        if (validator.isValid() && Protocol.Validator) {
            return Protocol.Validator.create();
        }
        else {
            return validator;
        }
    }

    function get (request, response) {
        var result = Object.keys(imposters).reduce(function (accumulator, id) {
            return accumulator.concat(imposters[id].toListJSON());
        }, []);

        response.format({
            json: function () { response.send({ imposters: result }); },
            html: function () { response.render('imposters', { imposters: result }); }
        });
    }

    function post (request, response) {
        var protocol = request.body.protocol,
            validator = createValidator(request.body);

        logger.debug(helpers.socketName(request.socket) + ' => ' + JSON.stringify(request.body));

        return validator.validate(request.body, logger).then(function (validation) {
            if (validation.isValid) {
                return Imposter.create(protocols[protocol], request.body).then(function (imposter) {
                    imposters[imposter.port] = imposter;
                    response.setHeader('Location', imposter.url);
                    response.statusCode = 201;
                    response.send(imposter.toJSON());
                }, function (error) {
                    logger.warn('error creating imposter: ' + JSON.stringify(errors.details(error)));
                    response.statusCode = (error.code === 'insufficient access') ? 403 : 400;
                    response.send({ errors: [error] });
                });
            }
            else {
                logger.warn('error creating imposter: ' + JSON.stringify(errors.details(validation.errors)));
                response.statusCode = 400;
                response.send({ errors: validation.errors });
                return Q(true);
            }
        });
    }

    return {
        get: get,
        post: post
    };
}

module.exports = {
    create: create
};
