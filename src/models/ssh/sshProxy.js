'use strict';

var net = require('net'),
    Connection = require('ssh2'),
    Q = require('q'),
    AbstractProxy = require('../abstractProxy');

function create (logger, encoding) {

    function socketName (socket) {
        return socket.host + ':' + socket.port;
    }

    function format (request) {
        return request.data.toString(encoding);
    }

    function setupProxy (options, originalRequest) {
      var ssh2 = new Connection();
      ssh2.connect({
        host: options.host,
        port: options.port,
        username: 'Thoughtworker',
        privateKey: require('fs').readFileSync('/Users/Thoughtworker/.ssh/id_rsa'),
        passphrase: 'xxxxxx'
      })
      return ssh2;
    }

    function proxy (ssh2) {
        var packets = [];
        var deferred = Q.defer();
        ssh2.on('ready', function() {
        console.log('Connection :: ready');
        ssh2.exec('uptime', function(err, stream) {
          if (err) throw err;
          stream.on('data', function(data, extended) {
            packets.push(data);
          });
          stream.on('end', function() {
            console.log('Stream :: EOF');
          });
          stream.on('close', function() {
            console.log('Stream :: close');
          });
          stream.on('exit', function(code, signal) {
            deferred.resolve({ data: Buffer.concat(packets).toString(encoding) });
            ssh2.end();
          });
        });
      });
        return deferred.promise;
    }

    return AbstractProxy.implement(logger, {
        formatRequest: format,
        formatResponse: format,
        formatDestination: socketName,
        setupProxy: setupProxy,
        proxy: proxy
    });
}

module.exports = {
    create: create
};
