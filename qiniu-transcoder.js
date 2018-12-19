var qiniu = require('qiniu');
var ns = require('node-schedule');
var qiniuConfig = require('./config.json').qiniu;
var transcode = qiniuConfig.transcode;
var mac = new qiniu.auth.digest.Mac(qiniuConfig.ak, qiniuConfig.sk);
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
    } else {
      console.log(respBody);
    }
  });
};

(() => {
  var srcKey = 's1-640x360-debug3.mp4';
  var fops = [];
  fops.push('avthumb/mp4/vcodec/libx264|saveas/' + qiniu.util.urlsafeBase64Encode(transcode.saveBucket + ':' + 'test1.mp4'));
  pfop(transcode.srcBucket, srcKey, fops, transcode.pipeline, transcode.options);
})();
