var qiniu = require('qiniu');
var ns = require('node-schedule');
var fopsConfig = require('./config.json').fops;
var mac = new qiniu.auth.digest.Mac(fopsConfig.ak, fopsConfig.sk);
var config = new qiniu.conf.Config();
config.zone = qiniu.zone.Zone_z0;
var operManager = new qiniu.fop.OperationManager(mac, config);

var pfop = (srcBucket, srcKey, fops, pipeline, options, callback) => {
  operManager.pfop(srcBucket, srcKey, fops, pipeline, options, function(err, respBody, respInfo) {
    if (err) {
      throw err;
    }

    if (respInfo.statusCode == 200) {
      console.log(respBody.persistentId);
      ns.scheduleJob('*/1 * * * * *', () => prefop(respBody.persistentId));
    } else {
      console.log(respInfo.statusCode);
      console.log(respBody);
    }
  });
};

var duration = 0;

var prefop = (persistentId, callback) => {
  operManager.prefop(persistentId, function(err, respBody, respInfo) {
    if (err) {
      console.log(err);
      throw err;
    } else {
      duration++
      console.log(respBody.desc + '/' + duration + 's');
      if (respBody.desc.indexOf('successfully') != -1) {
        process.exit(0);
      }
    }
  });
};

var parseSecond = (duration) => {
  var tmp = duration.split(':');
  return parseInt(tmp[0]) * 3600 + parseInt(tmp[1]) * 60 + parseInt(tmp[2]);
};

(() => {
  // var saveBucket = 'tvsonar-m3u8';
  // var pipeline = 'tvsonar';
  // var srcBucket = 'tvsonar';
  // var srcKey = 's2-cut-360p.mp4';
  // var options = {
  //   'notifyURL': 'http://api.example.com/pfop/callback',
  //   'force': false
  // };

  var filename = fopsConfig.srcKey.split('.')[0];
  var seconds = parseSecond(fopsConfig.duration);
  var block = seconds % fopsConfig.interval
    ? Math.floor(seconds / fopsConfig.interval) + 1
    : seconds / fopsConfig.interval;
  var fops = [];
  for (var i = 0; i < block; i++) {
    fops.push('avthumb/m3u8/noDomain/1/ss/' + i * fopsConfig.interval + '/t/' + fopsConfig.interval + '|saveas/' + qiniu.util.urlsafeBase64Encode(fopsConfig.saveBucket + ':' + filename + '/' + fopsConfig.interval + '-' + (
    i + 1)));
  }
  //console.log(fops);
  pfop(fopsConfig.srcBucket, fopsConfig.srcKey, fops, fopsConfig.pipeline, fopsConfig.options);
})();
