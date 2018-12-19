var qiniu = require('qiniu');
var mac = new qiniu.auth.digest.Mac('TM89YZRmwwTyzFX-FssQLUP_nvSPIW-zo6cvZ8pX', 'FZEs1kXW1C3S2cw4AkA8on2U2cZmg7Mo4LtYzvCA');
var config = new qiniu.conf.Config();
config.zone = qiniu.zone.Zone_z0;
var bucketManager = new qiniu.rs.BucketManager(mac, config);

//处理指令集合
var saveBucket = 'suona';
var fops = ['avthumb/m3u8/noDomain/1/ss/100/t/100/saveas/' + qiniu.util.urlsafeBase64Encode(saveBucket + ":users/0/test123")];
var pipeline = 'suona';
var srcBucket = 'suona';
var srcKey = 'output.mp4';

var options = {
  'limit': 10,
  //prefix: 'users/'
};

(() => {
  bucketManager.listPrefix(srcBucket, options, function(err, respBody, respInfo) {
    if (err) {
      console.log(err);
      throw err;
    }
    if (respInfo.statusCode == 200) {
      //如果这个nextMarker不为空，那么还有未列举完毕的文件列表，下次调用listPrefix的时候，
      //指定options里面的marker为这个值
      var nextMarker = respBody.marker;
      var commonPrefixes = respBody.commonPrefixes;
      console.log(nextMarker);
      console.log(commonPrefixes);
      var items = respBody.items;
      items.forEach(function(item) {
        console.log(item.key);
        // console.log(item.putTime);
        // console.log(item.hash);
        // console.log(item.fsize);
        // console.log(item.mimeType);
        // console.log(item.endUser);
        // console.log(item.type);
      });
    } else {
      console.log(respInfo.statusCode);
      console.log(respBody);
    }
  });
})();
