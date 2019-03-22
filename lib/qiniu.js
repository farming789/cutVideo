var qiniu = require('qiniu');
var crypto = require('crypto');
var qiniuConfig = require('../config/qiniu');
var mac = new qiniu.auth.digest.Mac(qiniuConfig.ak, qiniuConfig.sk);
var config = new qiniu.conf.Config();
config.zone = qiniu.zone[qiniuConfig.Zone_z0];

//构造上传函数
module.exports.uploadFile = (filename, srcPath, bucket, callback) => {
  var options = {
    scope: bucket
      ? bucket
      : qiniuConfig.bucket
  };
  var putPolicy = new qiniu.rs.PutPolicy(options);
  var formUploader = new qiniu.form_up.FormUploader(config);

  if (qiniuConfig.file_name_hash) {
    //md5计算上传文件名
    var name = filename.split('.')[0];
    var extention = filename.split('.')[1];
    var md5 = crypto.createHash('md5');
    //文件名+时间
    name+=new Date().toLocaleDateString();
    filename = md5.update(name, 'utf8').digest('hex') + '.' + extention;
  }
  var uploadToken = putPolicy.uploadToken(mac);
  var putExtra = new qiniu.form_up.PutExtra();
  formUploader.putFile(uploadToken, filename, srcPath, putExtra, callback);
};
