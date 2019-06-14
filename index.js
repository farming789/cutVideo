var ns = require('node-schedule');
var moment = require('moment');
var db = require('./lib/db_none_transational');
var ffmpeg = require('./lib/ffmpeg');
var acrcloud = require('./lib/acrcloud');
var async = require('async');
var execution = require('./execution/v1');
var syncJob=require('./execution/syncJob');
var scheduleOptions = require('./config/schedule');
var idProvider = require('./lib/IdProvider');
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
      db.query('select id,acr_bucket_name,file_path,novideo_status,file_title,updated_at from mv_origin where handle_status=1 and novideo_status = 0 and instance_id = ? limit ? ', [
        scheduleOptions.instance_id, scheduleOptions.noVideo.querylimit
      ], callback);
    },
    //抽取音频
    (rows, fields, callback) => {
        console.log("no video job:"+ JSON.stringify(rows));
      async.mapLimit(rows, scheduleOptions.noVideo.maplimit, execution.novideo, callback);
    }
  ], function (err, results) {
    if (err) {
      console.error("no video job error:"+err);
    }
    console.log('no video job done');
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
      db.query('select id,file_name,file_title,file_path,file_fingerprint,acr_bucket_name,upload_status from mv_novideos where upload_status = 0 and instance_id = ? limit ? ', [
        scheduleOptions.instance_id, scheduleOptions.uploadACRCloud.querylimit
      ], callback);
    },
    //抽取音频
    (rows, fields, callback) => {
        console.log("uploading acrcloud job:"+ JSON.stringify(rows));
      async.mapLimit(rows, scheduleOptions.uploadACRCloud.maplimit, execution.uploadACRCloud, callback);
    }
  ], function (err, results) {
    if (err) {
      console.error('upload acrcloud job error:'+err);
    }
    console.log('upload acrcloud job done');
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
      db.query('select id,file_path,file_title,acr_bucket_name,resize_status,resize from mv_origin where handle_status=1 and novideo_status = 1 and resize_status = 0 and instance_id = ? limit ? ', [
        scheduleOptions.instance_id, scheduleOptions.resize.querylimit
      ], callback);
    },
    //降低码率
    (rows, fields, callback) => {
       console.log("resizing job:"+ JSON.stringify(rows));
      async.mapLimit(rows, scheduleOptions.resize.maplimit, execution.resize, callback);
    }
  ], function (err, results) {
    if (err) {
      console.error('resize job error:'+err);
    }
    console.log('resize job done');
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
      db.query('select id,file_path,file_name,file_title,cut_status from mv_resize where cut_status = 0 and instance_id = ? limit ? ', [
        scheduleOptions.instance_id, scheduleOptions.cut.querylimit
      ], callback);
    },
    //剪切
    (rows, fields, callback) => {
        console.log("cutting job:"+ JSON.stringify(rows));
      async.mapLimit(rows, scheduleOptions.cut.maplimit, execution.cut, callback);
    }
  ], function (err, results) {
    if (err) {
      console.error('cut job error:'+err);
    }
    console.log('cut job done');
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
      db.query('select id,file_name,file_path,upload_status from mv_cut where upload_status = 0 and instance_id = ? limit ? ', [
        scheduleOptions.instance_id, scheduleOptions.uploadQiniu.querylimit
      ], callback);
    },
    //上传
    (rows, fields, callback) => {
      console.log("uploading qiniu:"+ JSON.stringify(rows));
      async.mapLimit(rows, scheduleOptions.uploadQiniu.maplimit, execution.uploadQiniu, callback);
    }
  ], function (err, results) {
    if (err) {
      console.error('upload qiniu error:'+err);
    }
    console.log('upload qiniu done');
    jobLocked.uploadQiniuJob = false;
    if (callback) {
      callback(err, results);
    }
  });
};

/**
 * 同步片源和片源剧集
 * @param callback
 */
var syncProjectJob=(callback)=>{
    if (jobLocked.syncProjectJob) {
        console.log('sync project job skip');
        return;
    } else {
        jobLocked.syncProjectJob = true;
    }
    console.log('sync project job begin');

    //查询出审核通过并且未同步的数据进行同步
    async.waterfall([
        (next)=>{
            db.query('select * from mv_origin where audit_status=1 and sync_status=0 and video_name is not null limit ?',[scheduleOptions.syncProject.querylimit],next);
        },
        (rows,fields,next)=>{
            async.mapLimit(rows,scheduleOptions.syncProject.maplimit,syncJob.syncProject,next);
        },
    ],function (err,results) {
        if (err) {
            console.log(err);
        } else {
            console.log('sync project job done');
        }
        jobLocked.syncProjectJob = false;
        if (callback) {
            callback(err, results);
        }
    })
}

/**
 * 同步片源切片
 * @param callback
 */
var syncCutJob=(callback)=>{
    if (jobLocked.syncCutJob) {
        console.log('sync cut job skip');
        return;
    } else {
        jobLocked.syncCutJob = true;
    }
    console.log('sync cut job begin');


    //查询出审核通过并且已经同步过片源的数据，但是没有同步过切片的数据
    async.waterfall([
        (next)=>{
            db.query('select * from mv_origin where audit_status=1 and sync_status=1 and sync_cut_status=0 limit ?',[scheduleOptions.syncCut.querylimit],next);
        },
        (rows,fields,next)=>{
            async.mapLimit(rows,scheduleOptions.syncCut.maplimit,syncJob.syncCut,next);
        },
    ],function (err,results) {
        if (err) {
            console.log(err);
        } else {
            console.log('sync cut job done');
        }
        jobLocked.syncCutJob = false;
        if (callback) {
            callback(err, results);
        }
    })

}

//手动同步es的可识别状态
var batchSyncEs=()=>{
    syncJob.batchSyncEs();
}

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
      setTimeout(function () {
          eval(args[0] + '()');
      },5000)
  } else {
    scheduleOptions.noVideo.enabled && ns.scheduleJob(scheduleOptions.noVideo.cron, (fireDate) => noVideoJob());
    scheduleOptions.uploadACRCloud.enabled && ns.scheduleJob(scheduleOptions.uploadACRCloud.cron, (fireDate) => uploadACRCloudJob());
    scheduleOptions.resize.enabled && ns.scheduleJob(scheduleOptions.resize.cron, (fireDate) => resizeJob());
    scheduleOptions.cut.enabled && ns.scheduleJob(scheduleOptions.cut.cron, (fireDate) => cutJob());
    scheduleOptions.uploadQiniu.enabled && ns.scheduleJob(scheduleOptions.uploadQiniu.cron, (fireDate) => uploadQiniuJob());
    scheduleOptions.syncProject.enabled && ns.scheduleJob(scheduleOptions.syncProject.cron, (fireDate) => syncProjectJob());
    scheduleOptions.syncCut.enabled && ns.scheduleJob(scheduleOptions.syncCut.cron, (fireDate) => syncCutJob());
    console.log('xj schedule start.');
  }
})();
