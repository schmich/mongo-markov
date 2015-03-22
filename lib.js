var async = require('asyncawait/async');
var await = require('asyncawait/await');
var Promise = require('bluebird');
var mongodb = Promise.promisifyAll(require('mongodb'));
var Log = require('winston');
var moment = require('moment');
var sprintf = require('sprintf');
var MongoClient = mongodb.MongoClient;
var Collection = mongodb.Collection;

Log.remove(Log.transports.Console);
Log.add(Log.transports.Console, { timestamp: function() { return moment().format(); } });

function sleep(duration) {
  return new Promise(function(resolve, reject) {
    setTimeout(resolve, duration);
  });
}

module.exports = {
  async: async,
  await: await,
  Log: Log,
  sprintf: sprintf,
  MongoClient: MongoClient,
  Promise: Promise,
  sleep: sleep
};
