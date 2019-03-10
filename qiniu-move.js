var ns = require('node-schedule');
var async = require('async');
var db = require('./lib/db_none_transational');
var qiniu = require('qiniu');
var qiniuConfig = require('./config/qiniu');
var mac = new qiniu.auth.digest.Mac(qiniuConfig.ak, qiniuConfig.sk);
var config = new qiniu.conf.Config();
config.zone = qiniu.zone[qiniuConfig.Zone_z0];

var bucketManager = new qiniu.rs.BucketManager(mac, config);
var options = {
  force: false
};
var jobLocked = {};

var move = (row, callback) => {
  bucketManager.move(row.qiniu_bucket, row.qiniu_key, 'suona-cut-resouce', row.qiniu_key, options, function(err, body, info) {
    if (err) {
      console.log(err);
    } else {
      row.qiniu_bucket = 'suona-cut-resouce';
      row.updated_at = new Date().zoneDate();
      db.updateTable('mv_cut', 'id', [row], callback);
    }
  });
  // console.log(row.qiniu_bucket);
  // console.log(row);
  // bucketManager.stat(row.qiniu_bucket,row.qiniu_key, function(err, respBody, respInfo) {
  // if (err) {
  //   console.log(err);
  //   throw err;
  // } else {
  //   if (respInfo.statusCode == 200) {
  //     console.log(respBody.hash);
  //     console.log(respBody.fsize);
  //     console.log(respBody.mimeType);
  //     console.log(respBody.putTime);
  //     console.log(respBody.type);
  //   } else {
  //     console.log(respInfo.statusCode);
  //     console.log(respBody.error);
  //   }
  // }
};

var batchMove = (callback) => {
  if (jobLocked.batchMove) {
    console.log('qiniu move job skip');
    return;
  } else {
    jobLocked.batchMove = true;
  }
  console.log('qiniu move job begin');
  async.waterfall([
    //获取飞幕对应mv_feimu记录
    (callback) => {
      db.query('select * from mv_cut where instance_id = ? and qiniu_bucket = ? limit ? ', [
        5470, 'suona-cut-uat', 100
      ], callback);
    },
    //剪切视频
    (rows, fields, callback) => {
      async.mapLimit(rows, 20, move, callback);
    }
  ], function(err, results) {
    if (err) {
      console.log(err);
    } else {
      console.log('qiniu move job done');
    }
    jobLocked.batchMove = false;
    if (callback) {
      callback(err, results);
    }
  });
};

(() => {
  ns.scheduleJob('*/1 * * * *', (fireDate) => batchMove());
})();
