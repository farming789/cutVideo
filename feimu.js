var ns = require('node-schedule');
var moment = require('moment');
var db = require('./lib/db_none_transational');
var ffmpeg = require('./lib/ffmpeg');
var acrcloud = require('./lib/acrcloud');
var async = require('async');
var execution = require('./execution/v1');
var scheduleOptions = require('./config/schedule');
var jobLocked = {};

var getSchedule = (sc) => {
  if (sc.scheduleType == 'cron'){
    //cron表达式定时任务，最短间隔1分钟
    return sc.rule;
  } else if (sc.scheduleType == 'recurrence'){
    return sc.rule;
  }
}

var feimuCutJob = (callback) => {
  if (jobLocked.feimuCutJob) {
    console.log('feimu cut job skip');
    return;
  } else {
    jobLocked.feimuCutJob = true;
  }
  console.log('feimu cut job begin');
  async.waterfall([
    //更新飞幕resize文件路径
    (callback) => {
      db.query('update mv_feimu mf,mv_resize mr,mv_origin mo set mf.file_resize_path = mr.file_path where mf.instance_id = ? and mf.file_resize_path is null and mo.resize_status = 1 and mo.file_path = mf.file_origin_name and mo.file_title = mr.file_title', [scheduleOptions.instance_id], callback);
    },
    //获取飞幕对应mv_feimu记录
    (rows, fields, callback) => {
      db.query('select * from mv_feimu where cut_status = 0 and file_resize_path is not null and instance_id = ? limit ? ', [
        scheduleOptions.instance_id, scheduleOptions.feimuCut.querylimit
      ], callback);
    },
    //剪切视频
    (rows, fields, callback) => {
      async.mapLimit(rows, scheduleOptions.feimuCut.maplimit, execution.feimuCut, callback);
    }
  ], function(err, results) {
    if (err) {
      console.log(err);
    } else {
      console.log('feimu cut job done');
    }
    jobLocked.feimuCutJob = false;
    if (callback) {
      callback(err, results);
    }
  });
};

var uploadFeimuCutJob = (callback) => {
  if (jobLocked.uploadFeimuCutJob) {
    console.log('upload feimu cut job skip');
    return;
  } else {
    jobLocked.uploadFeimuCutJob = true;
  }
  console.log('upload feimu cut job begin');
  var feimuCodes;
  async.waterfall([
    //先获取需要上传的飞幕记录
    (callback) => {
      db.query('select feimu_code from mv_feimu where instance_id = ? and cut_status = 1 and upload_status = 0 limit ?', [
        scheduleOptions.instance_id, scheduleOptions.uploadFeimuCut.querylimit
      ], callback);
    },
    //获取待上传记录
    (rows, fields, callback) => {
      feimuCodes = rows.map(row => row.feimu_code);
      if (feimuCodes.length) {
        db.query('select * from mv_feimu_upload where instance_id = ? and qiniu_hash is null and feimu_code in (?)', [
          scheduleOptions.instance_id, feimuCodes
        ], callback);
      } else {
        callback(null, [], []);
      }
    },
    //上传七牛云
    (rows, fields, callback) => {
      async.mapLimit(rows, scheduleOptions.uploadFeimuCut.maplimit, execution.uploadFiemuCut, callback);
    },
    //更新飞幕状态
    (results, callback) => {
      if (feimuCodes.length) {
        db.query('update mv_feimu set upload_status = 1 where feimu_code in (?)', [feimuCodes], callback);
      } else {
        callback(null,[]);
      }
    }
  ], function(err, results) {
    if (err) {
      console.log(err);
    } else {
      console.log('upload feimu cut job done');
    }
    jobLocked.uploadFeimuCutJob = false;
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
    scheduleOptions.feimuCut.enabled && ns.scheduleJob(scheduleOptions.feimuCut.rule, (fireDate) => feimuCutJob());
    scheduleOptions.uploadFeimuCut.enabled && ns.scheduleJob(scheduleOptions.uploadFeimuCut.rule, (fireDate) => uploadFeimuCutJob());
    console.log('xj schedule start.');
  }
})();
