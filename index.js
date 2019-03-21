var ns = require('node-schedule');
var moment = require('moment');
var db = require('./lib/db_none_transational');
var ffmpeg = require('./lib/ffmpeg');
var acrcloud = require('./lib/acrcloud');
var async = require('async');
var execution = require('./execution/v1');
var scheduleOptions = require('./config/schedule');
var jobLocked = {};

var noVideoJob = (callback) => {
  if (jobLocked.noVideoJob) {
    console.log('no video job skip');
    return;
  } else {
    jobLocked.noVideoJob = true;
  }
  console.log('no video job begin');
  async.waterfall([
    //先获取原始视频记录
    (callback) => {
      db.query('select * from mv_origin where novideo_status = 0 and instance_id = ? limit ? ', [
        scheduleOptions.instance_id, scheduleOptions.noVideo.querylimit
      ], callback);
    },
    //抽取音频
    (rows, fields, callback) => {
      async.mapLimit(rows, scheduleOptions.noVideo.maplimit, execution.novideo, callback);
    }
  ], function (err, results) {
    if (err) {
      console.log(err);
    } else {
      console.log('no video job done');
    }
    jobLocked.noVideoJob = false;
    if (callback) {
      callback(err, results);
    }
  });
};

var uploadACRCloudJob = (callback) => {
  if (jobLocked.uploadACRCloudJob) {
    console.log('upload acrcloud job skip');
    return;
  } else {
    jobLocked.uploadACRCloudJob = true;
  }
  console.log('upload acrcloud job begin');
  async.waterfall([
    (callback) => {
      db.query('select * from mv_novideos where upload_status = 0 and instance_id = ? limit ? ', [
        scheduleOptions.instance_id, scheduleOptions.uploadACRCloud.querylimit
      ], callback);
    },
    //抽取音频
    (rows, fields, callback) => {
      async.mapLimit(rows, scheduleOptions.uploadACRCloud.maplimit, execution.uploadACRCloud, callback);
    }
  ], function (err, results) {
    if (err) {
      console.log(err);
    } else {
      console.log('upload acrcloud job done');
    }
    jobLocked.uploadACRCloudJob = false;
    if (callback) {
      callback(err, results);
    }
  });
};

var resizeJob = (callback) => {
  if (jobLocked.resizeJob) {
    console.log('resize job skip');
    return;
  } else {
    jobLocked.resizeJob = true;
  }
  console.log('resize job begin');
  async.waterfall([
    //先获取原始视频记录
    (callback) => {
      db.query('select * from mv_origin where novideo_status = 1 and resize_status = 0 and instance_id = ? limit ? ', [
        scheduleOptions.instance_id, scheduleOptions.resize.querylimit
      ], callback);
    },
    //降低码率
    (rows, fields, callback) => {
      async.mapLimit(rows, scheduleOptions.resize.maplimit, execution.resize, callback);
    }
  ], function (err, results) {
    if (err) {
      console.log(err);
    } else {
      console.log('resize job done');
    }
    jobLocked.resizeJob = false;
    if (callback) {
      callback(err, results);
    }
  });
};

var cutJob = (callback) => {
  if (jobLocked.cutJob) {
    console.log('cut job skip');
    return;
  } else {
    jobLocked.cutJob = true;
  }
  console.log('cut job begin');
  async.waterfall([
    //先获取原始视频记录
    (callback) => {
      db.query('select * from mv_resize where cut_status = 0 and instance_id = ? limit ? ', [
        scheduleOptions.instance_id, scheduleOptions.cut.querylimit
      ], callback);
    },
    //剪切
    (rows, fields, callback) => {
      async.mapLimit(rows, scheduleOptions.cut.maplimit, execution.cut, callback);
    }
  ], function (err, results) {
    if (err) {
      console.log(err);
    } else {
      console.log('cut job done');
    }
    jobLocked.cutJob = false;
    if (callback) {
      callback(err, results);
    }
  });
};

var uploadQiniuJob = (callback) => {
  if (jobLocked.uploadQiniuJob) {
    console.log('upload qiniu job skip');
    return;
  } else {
    jobLocked.uploadQiniuJob = true;
  }
  console.log('upload qiniu job begin');
  async.waterfall([
    //先获取原始视频记录
    (callback) => {
      db.query('select * from mv_cut where upload_status = 0 and instance_id = ? limit ? ', [
        scheduleOptions.instance_id, scheduleOptions.uploadQiniu.querylimit
      ], callback);
    },
    //上传
    (rows, fields, callback) => {
      console.log("uploading qiniu:"+rows);
      async.mapLimit(rows, scheduleOptions.uploadQiniu.maplimit, execution.uploadQiniu, callback);
    }
  ], function (err, results) {
    if (err) {
      console.log(err);
    } else {
      console.log('upload qiniu done');
    }
    jobLocked.uploadQiniuJob = false;
    if (callback) {
      callback(err, results);
    }
  });
};


process.env.TZ = "Asia/Shanghai";
Date.prototype.TimeZone = new Map([
    ['Europe/London',0],
    ['Asia/Shanghai',8],
    ['America/New_York',5]
]);
Date.prototype.zoneDate = function(){
    if(process.env.TZ == undefined){
      return new Date();
    }else{
      for (let item of this.TimeZone.entries()) {
        if(item[0] == process.env.TZ){
          let d = new Date();
          d.setHours(d.getHours()+item[1]);
          return d;
        }
      }
      return new Date();
    }
};

(() => {
  var args = process.argv.slice(2);
  if (args.length == 1) {
    eval(args[0] + '()');
  } else {
    scheduleOptions.noVideo.enabled && ns.scheduleJob(scheduleOptions.noVideo.cron, (fireDate) => noVideoJob());
    scheduleOptions.uploadACRCloud.enabled && ns.scheduleJob(scheduleOptions.uploadACRCloud.cron, (fireDate) => uploadACRCloudJob());
    scheduleOptions.resize.enabled && ns.scheduleJob(scheduleOptions.resize.cron, (fireDate) => resizeJob());
    scheduleOptions.cut.enabled && ns.scheduleJob(scheduleOptions.cut.cron, (fireDate) => cutJob());
    scheduleOptions.uploadQiniu.enabled && ns.scheduleJob(scheduleOptions.uploadQiniu.cron, (fireDate) => uploadQiniuJob());
    console.log('xj schedule start.');
  }
})();
