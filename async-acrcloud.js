var ns = require('node-schedule');
var moment = require('moment');
var db = require('./lib/db_none_transational');
var ffmpeg = require('./lib/ffmpeg');
var acrcloud = require('./lib/acrcloud');
var async = require('async');
var execution = require('./execution/v1');
var scheduleOptions = require('./config/schedule');
var jobLocked = {};

var asyncJob = (callback) => {
  if (jobLocked.asyncJob) {
    console.log('async acrcloud job skip');
    return;
  } else {
    jobLocked.asyncJob = true;
  }
  console.log('async acrcloud job begin');
  async.waterfall([
    //获取待同步记录
    (callback) => {
      db.query('select * from mv_novideos where acr_state = 0 and del_status = 0 limit ? ', [scheduleOptions.asyncACR.querylimit], callback);
    },
    //同步acrcloud状态
    (rows, fields, callback) => {
      async.mapLimit(rows, scheduleOptions.asyncACR.maplimit, execution.asyncACRCloud, callback);
    }
  ], function(err, results) {
    if (err) {
      console.log(err);
    } else {
      console.log('async acrcloud job done');
    }
    jobLocked.asyncJob = false;
    if (callback) {
      callback(err, results);
    }
  });
};

var deleteJob = (callback) => {
  if (jobLocked.deleteJob) {
    console.log('delete acrcloud job skip');
    return;
  } else {
    jobLocked.deleteJob = true;
  }
  console.log('delete acrcloud job begin');
  async.waterfall([
    //获取待删除记录
    (callback) => {
      db.query('select * from mv_novideos where del_status = 1 limit ? ', [scheduleOptions.asyncACR.querylimit], callback);
    },
    //删除acrcloud记录
    (rows, fields, callback) => {
      async.mapLimit(rows, scheduleOptions.asyncACR.maplimit, execution.deleteACRCloud, callback);
    }
  ], function(err, results) {
    if (err) {
      console.log(err);
    } else {
      console.log('delete acrcloud job done');
    }
    jobLocked.deleteJob = false;
    if (callback) {
      callback(err, results);
    }
  });
};

(() => {
  var args = process.argv.slice(2);
  if (args.length == 1) {
    eval(args[0] + '()');
  } else {
    scheduleOptions.asyncACR.enabled && ns.scheduleJob(scheduleOptions.asyncACR.cron, (fireDate) => asyncJob());
    scheduleOptions.asyncACR.enabled && ns.scheduleJob(scheduleOptions.asyncACR.cron, (fireDate) => deleteJob());
    console.log('async acrcloud start.');
  }
})();
