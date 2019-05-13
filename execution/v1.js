var db = require('../lib/db_none_transational');
var ffmpeg = require('../lib/ffmpeg');
var moment = require('moment');
var acrcloud = require('../lib/acrcloud');
var qiniu = require('../lib/qiniu');
var async = require('async');
var ffmpegConfig = require('../config/ffmpeg');
var acrcloudConfig = require('../config/acrcloud');
var qiniuConfig = require('../config/qiniu');
var scheduleOptions = require('../config/schedule');

var cut = (item, callback) => {
  ffmpeg.execution(item.file_origin_path, item.file_path, item.cut_options, (err, result) => {
    if (err) {
      callback(new Error(err), null);
    } else {
      //保存信息到数据库
      item.upload_status = 0;
      item.created_at = new Date().zoneDate();
      item.cut_options = JSON.stringify(item.cut_options);
      db.replaceTable('mv_cut', [item], callback);
    }
  });
}

var upload = (row, callback) => {
  acrcloud.uploadAudio({
    endpoint: '/v1/audios',
    data_type: acrcloudConfig.dataType,
    bucket_name: row.acr_bucket_name,
    audio_file: acrcloudConfig.dataType == 'fingerprint' && row.file_fingerprint
      ? row.file_fingerprint
      : row.file_path,
    audio_id: row.id,
    title: row.file_title
  }, (err, httpResponse, body) => {
    if (err) {
      callback(err, null);
    } else if (!(httpResponse.statusCode == 200 || httpResponse.statusCode == 201)) {
      callback(body, null);
    } else {
      row.acr_id = body.acr_id;
      row.acr_title = body.title;
      row.acr_state = body.state;
      row.acr_audio_id = body.audio_id;
      row.upload_type = acrcloudConfig.dataType;
      row.upload_status = true;
      row.updated_at = new Date().zoneDate();
      db.updateTable('mv_novideos', 'id', [row], callback);
    }
  });
};

//抽取音频
module.exports.novideo = (row, callback) => {
    var startTime=new Date().zoneDate();//记录开始抽取时间
  async.waterfall([
    //通过ffmpeg先获取基本信息
    (callback) => {
      ffmpeg.info(ffmpegConfig.basePath.origin.replace('${acr_bucket_name}',row.acr_bucket_name) + row.file_path, callback);
    },
    //抽取音频
    (metadata, callback) => {
      var fileName = row.file_path.split('.')[0];
      var extention = row.file_path.split('.')[1];
      var options = {
        "noVideo": true,
        "audioCodec": 'copy'
      };
      //使用ffmpeg抽取m4a音频文件，音频文件存储在ffmpegConfig.basePath.novideo文件夹下
      ffmpeg.execution(ffmpegConfig.basePath.origin.replace('${acr_bucket_name}',row.acr_bucket_name) + row.file_path, ffmpegConfig.basePath.novideo + fileName + '.m4a', options, (err, result) => {
        if (err) {
          //抽取失败，更新mv_origin
          row.novideo_status = -1;
          db.updateTable('mv_origin', 'id', [row], callback);
        } else {
          var options = {
            fileName: fileName,
            inputFile: ffmpegConfig.basePath.novideo + fileName + '.m4a',
            outputFile: ffmpegConfig.basePath.fingerprint + fileName + '.acr'
          }
          //通过acrCloud生成指纹文件,指纹文件存储在ffmpegConfig.basePath.fingerprint文件夹下
          acrcloud.createFingerprint(options, (err, stdout, stderr) => {
            if (err) {
              //指纹生成失败，更新mv_origin
              console.log('acrcloud fingerprint error:', err);
              row.novideo_status = -2;
              db.updateTable('mv_origin', 'id', [row], callback);
            } else {
              //指纹生成成功，插入mv_novideos,并更新mv_origin
              var item = {
                instance_id: scheduleOptions.instance_id,
                file_path: ffmpegConfig.basePath.novideo + fileName + '.m4a',
                file_name: fileName + '.m4a',
                file_fingerprint: ffmpegConfig.basePath.fingerprint + fileName + '.acr',
                file_title: row.file_title,
                acr_bucket_name: row.acr_bucket_name,
                upload_status: 0,
                created_at: new Date().zoneDate(),
                  novideo_start_time:startTime,
                  novideo_end_time:new Date().zoneDate()
              };
              db.insertIgnoreTable('mv_novideos', [item], (err, result) => {
                if (err) {
                  callback(err, null);
                } else {
                  row.metadata = JSON.stringify(metadata);
                  row.novideo_status = true;
                  row.updated_at = new Date().zoneDate();
                  db.updateTable('mv_origin', 'id', [row], callback);
                }
              });
            }
          });
        }
      });
    }
  ], (err, result) => {
    if (err) {
      if (err.message.indexOf('No such file or directory') != -1) {
        //源文件缺失
        row.novideo_status = -3;
        db.updateTable('mv_origin', 'id', [row], function (err,result) {});
      } else if (err.message.indexOf('Invalid data found when processing input') != -1) {
        //源文件缺失
        row.novideo_status = -4;
        db.updateTable('mv_origin', 'id', [row], function (err,result) {});
      } else {
          //未知
          row.novideo_status = -5;
          db.updateTable('mv_origin', 'id', [row], function (err,result) {});
      }
      callback(err, null);
    } else {
      callback(null, result.items);
    }
  });
};

//生成指纹文件，如果发现没有指纹文件，则重新生成指纹文件
module.exports.uploadACRCloud = (row, callback) => {
  if (acrcloudConfig.dataType == 'fingerprint' && !row.file_fingerprint) {
    //重新生成指纹文件
    var fileName = row.file_name.split('.')[0];
    var options = {
      fileName: fileName,
      inputFile: row.file_path,
      outputFile: ffmpegConfig.basePath.fingerprint + fileName + '.acr'
    }
    acrcloud.createFingerprint(options, (err, stdout, stderr) => {
      if (err) {
        callback(err, null);
      } else {
        row.file_fingerprint = options.outputFile;
        upload(row, callback);
      }
    });
  } else {
    upload(row, callback);
  }
};

module.exports.asyncACRCloud = (row, callback) => {
  acrcloud.asyncAudio({
    endpoint: '/v1/audios/' + row.acr_id
  }, (err, httpResponse, body) => {
    if (err) {
      callback(err, null);
    } else if (!(httpResponse.statusCode == 200 || httpResponse.statusCode == 201)) {
      if (body.status == 500) {
        //内部错误
        row.acr_state = -1;
        db.updateTable('mv_novideos', 'id', [row], callback);
      } else {
        callback(body, null);
      }
    } else {
      row.acr_sid = body.id;
      row.acr_bucket_id = body.bucket_id;
      row.acr_duration = body.duration;
      row.acr_state = body.state;
      row.updated_at = new Date().zoneDate();
      db.updateTable('mv_novideos', 'id', [row], callback);
    }
  });
};

module.exports.deleteACRCloud = (row, callback) => {
  acrcloud.deleteAudio({
    endpoint: '/v1/audios/' + row.acr_id
  }, (err, httpResponse, body) => {
    if (err) {
      callback(err, null);
    } else if (!(httpResponse.statusCode == 204)) {
      if (body.status == 500) {
        //内部错误
        row.del_status = -1;
        db.updateTable('mv_novideos', 'id', [row], callback);
      } else if (body.status == 404) {
        //已经删除
        row.del_status = -2;
        db.updateTable('mv_novideos', 'id', [row], callback);
      } else {
        callback(body, null);
      }
    } else {
      row.del_status = 2;
      row.updated_at = new Date().zoneDate();
      db.updateTable('mv_novideos', 'id', [row], callback);
    }
  });
};

module.exports.resize = (row, callback) => {
  //console.log ('row = ' ,row);
    var resizeStartTime=new Date().zoneDate();//开始转码时间
  async.waterfall([
    //通过ffmpeg 先获取基本信息
    (callback) => {
      ffmpeg.info(ffmpegConfig.basePath.origin.replace('${acr_bucket_name}',row.acr_bucket_name)  + row.file_path, callback);
    },
    //降低码率
    (metadata, callback) => {
      var fileName = row.file_path.split('.')[0];
      var extention = row.file_path.split('.')[1];

      var vidoeStream = ffmpeg.getVideoStream(metadata.streams);
      var audioStream = ffmpeg.getAudioStream(metadata.streams);

      if (vidoeStream&&vidoeStream) {
        console.log('开始转码');
        var width = vidoeStream.width;
        var height = vidoeStream.height;
        //获取根据设定的分辨率读取配置文件信息
        var resize = ffmpegConfig.resize[row.resize];
        //源文件码率大于目标码率，则降码处理
        var options = {
          videoBitrate: vidoeStream.bit_rate > resize.videoBitrate * 1024
            ? resize.videoBitrate
            : 0,
          audioBitrate: audioStream.bit_rate > resize.audioBitrate * 1024
            ? resize.audioBitrate
            : 0
        }
        if (resize && width > resize.width && height > resize.height) {
          //源文件宽高大与目标宽高
          console.log('源文件宽高大与目标宽高');
          if (width * resize.height >= height * resize.width) {
            //长和宽必须是偶数
            var fixedWidth = 2 * Math.round(width * resize.height / (height * 2));
            options.size = fixedWidth + 'x' + resize.height;
          } else {
            //长和宽必须是偶数
            var fixedHeight = 2 * Math.round(height * resize.width / (width * 2));
            options.size = resize.width + 'x' + fixedHeight;
          }
        } else {
          //源文件宽高小于目标宽高，判断是否要强制转码
          console.log('源文件宽高小于目标宽高');
          options.size = width + 'x' + height;
          if (!ffmpegConfig.resize.forceResize) {
            //不强制转码
            console.log('不强制转码');
            var item = {
              instance_id: scheduleOptions.instance_id,
              file_path: ffmpegConfig.basePath.origin.replace('${acr_bucket_name}',row.acr_bucket_name)  + row.file_path,
              file_name: row.file_path,
              file_title: row.file_title,
              cut_status: 0,
              upload_status: 0,
              created_at: new Date().zoneDate(),
              resize_start_time:resizeStartTime,
              resize_end_time:new Date().zoneDate()
            };
            db.insertIgnoreTable('mv_resize', [item], (err, result) => {
              if (err) {
                callback(err, null);
              } else {
                row.duration = metadata.format.duration;
                row.size = metadata.format.size;
                row.start_time = metadata.format.start_time;
                row.bit_rate = metadata.format.bit_rate;
                row.resize_status = true;
                row.updated_at = new Date().zoneDate();
                db.updateTable('mv_origin', 'id', [row], callback);
              }
            });
            return;
          }
        }
        //options：audioBitrate  videoBitrate  size
        ffmpeg.execution(ffmpegConfig.basePath.origin.replace('${acr_bucket_name}',row.acr_bucket_name)  + row.file_path, ffmpegConfig.basePath.resize + fileName + '-' + options.size + '.mp4', options, (err, result) => {
          if (err) {
            //callback(err, null);
            row.resize_status = -2;
            db.updateTable('mv_origin', 'id', [row], callback);
          } else {
            //插入mv_resize表，并更新mv_origin的
            var item = {
              instance_id: scheduleOptions.instance_id,
              file_path: ffmpegConfig.basePath.resize + fileName + '-' + options.size + '.mp4',
              file_name: fileName + '-' + options.size + '.mp4',
              file_title: row.file_title,
              cut_status: 0,
              upload_status: 0,
              created_at: new Date().zoneDate(),
              resize_start_time:resizeStartTime,
              resize_end_time:new Date().zoneDate()
            };
            db.insertIgnoreTable('mv_resize', [item], (err, result) => {
              if (err) {
                callback(err, null);
              } else {
                row.duration = metadata.format.duration;
                row.size = metadata.format.size;
                row.start_time = metadata.format.start_time;
                row.bit_rate = metadata.format.bit_rate;
                row.resize_status = true;
                row.updated_at = new Date().zoneDate();
                db.updateTable('mv_origin', 'id', [row], callback);
              }
            });
          }
        });
      } else {
        //非视频文件
        console.log('streams length = ', metadata.streams.length)
        console.log('非视频文件, row = ', row);
        row.resize_status = -1;
        db.updateTable('mv_origin', 'id', [row], callback);
        // callback(null, {
        //   message: '非视频文件',
        //   items: []
        // });
      }
    }
  ], (err, result) => {
    if (err) {
        if (err.message.indexOf('No such file or directory') != -1) {
            //源文件缺失
            row.resize_status = -3;
            db.updateTable('mv_origin', 'id', [row], function (err,result) {});
        } else if (err.message.indexOf('Invalid data found when processing input') != -1) {
            //源文件缺失
            row.resize_status = -4;
            db.updateTable('mv_origin', 'id', [row], function (err,result) {});
        } else {
            //未知
            row.resize_status = -5;
            db.updateTable('mv_origin', 'id', [row], function (err,result) {});
        }
        callback(err, null);
    } else {
      callback(null, result);
    }
  });
};

module.exports.cut = (row, callback) => {
    var cutStartTime=new Date().zoneDate();
  async.waterfall([
    //先获取基本信息
    (callback) => {
      ffmpeg.info(row.file_path, callback);
    },
    //剪切
    (metadata, callback) => {
      var fileName = row.file_name.split('.')[0];
      if (metadata.format) {
        row.duration = metadata.format.duration;
        row.size = metadata.format.size;
        row.start_time = metadata.format.start_time;
        row.bit_rate = metadata.format.bit_rate;
        var block = (row.duration - ffmpegConfig.cut.duration) % ffmpegConfig.cut.interval
          ? Math.round((row.duration - ffmpegConfig.cut.duration) / ffmpegConfig.cut.interval) + 1
          : (row.duration - ffmpegConfig.cut.duration) / ffmpegConfig.cut.interval + 1;
        var opts = [];
        for (var i = 0; i < block; i++) {
          var item = {
            instance_id: scheduleOptions.instance_id,
            file_origin_path: row.file_path,
            file_origin_name: row.file_name,
            file_origin_title: row.file_title,
            file_path: ffmpegConfig.basePath.cut + fileName + '-cut-' + ffmpegConfig.cut.duration + '-' + ffmpegConfig.cut.interval + '-' + i + '.mp4',
            file_name: fileName + '-cut-' + ffmpegConfig.cut.duration + '-' + ffmpegConfig.cut.interval + '-' + i + '.mp4',
            cut_options: {
              startTime: i * ffmpegConfig.cut.interval,
              duration: (i != block - 1)
                ? ffmpegConfig.cut.duration
                : 0
            }
          }
          opts.push(item);
        }
        //console.log(item);
        db.query('select file_name from mv_cut where file_origin_name = ? ', [row.file_name], (err, rows, fields) => {
          //去重过滤，已经切出来的片段，不再进行切片
          var fileNames = rows.map(row => row.file_name);
          opts = opts.filter(item => fileNames.indexOf(item.file_name) == -1);
          //开始批量切片
          async.mapLimit(opts, scheduleOptions.cut.cutlimit, cut, (err, results) => {
            //全部切割完毕后更新resize文件状态
            if (err) {
              callback(err, null);
            } else {
              row.cut_status = true;
              row.updated_at = new Date().zoneDate();
              row.cut_end_time=new Date().zoneDate();
              row.cut_start_time=cutStartTime;
              db.updateTable('mv_resize', 'id', [row], callback);
            }
          });
        });
      } else {
        callback(null, '未获取到视频格式信息');
      }
    }
  ], (err, result) => {
    if (err) {
      if (err.message.indexOf('No such file or directory') != -1) {
        //源文件缺失
        row.cut_status = -2;
        db.updateTable('mv_resize', 'id', [row], function (err,result) {});
      } else if (err.message.indexOf('Invalid data found when processing input') != -1) {
        //源文件缺失
        row.cut_status = -1;
        db.updateTable('mv_resize', 'id', [row], function (err,result) {});
      }else {
        //未知
          row.cut_status = -5;
          db.updateTable('mv_resize', 'id', [row], function (err,result) {});
      }
      callback(err, null);
    } else {
      callback(null, result);
    }
  });
};

module.exports.uploadQiniu = (row, callback) => {
    var uploadStartTime=new Date().zoneDate();
  qiniu.uploadFile(row.file_name, row.file_path, null, (err, body, info) => {
    if (err) {
      callback(err, null);
    } else {
      if (body && body.hash && body.key) {
        row.qiniu_zone = qiniuConfig.zone;
        row.qiniu_bucket = qiniuConfig.bucket;
        row.qiniu_hash = body.hash;
        row.qiniu_key = body.key;
        row.upload_status = 1;
        row.updated_at = new Date().zoneDate();
        row.upload_start_time=uploadStartTime;
        row.upload_end_time=new Date().zoneDate();
        db.updateTable('mv_cut', 'id', [row], callback);
      } else {
        callback(null, 'qiniu upload error:' + body);
      }
    }
  });
};

module.exports.feimuCut = (row, callback) => {
  var uploadItems = [];
  async.waterfall([
    //先获取基本信息
    (callback) => {
      ffmpeg.info(row.file_resize_path, callback);
    },
    //剪切
    (metadata, callback) => {
      var dateStr = moment().format('YYYYMMDDHHmmssSSS');
      var file_name = row.member_id + '-' + dateStr + '.mp4';
      var jpg_name = row.member_id + '-' + dateStr + '0.jpg';
      var gif_name = row.member_id + '-' + dateStr + '0.gif';
      var options = {
        "startTime": row.start,
        "duration": row.end - row.start
      };
      ffmpeg.execution(row.file_resize_path, ffmpegConfig.basePath.feimuCut + file_name, options, (err, result) => {
        if (err) {
          row.cut_status = -1;
          db.updateTable('mv_feimu', 'id', [row], callback);
        } else {
          row.file_path = ffmpegConfig.basePath.feimuCut + file_name;
          row.jpg_name = jpg_name;
          row.jpg_path = ffmpegConfig.basePath.feimuCutJPG + jpg_name;
          row.gif_name = gif_name;
          row.gif_path = ffmpegConfig.basePath.feimuCutGIF + gif_name;
          var item = {
            instance_id: scheduleOptions.instance_id,
            feimu_code: row.feimu_code,
            file_name: file_name,
            file_path: row.file_path,
            qiniu_zone: qiniuConfig.feimu.zone,
            qiniu_bucket: qiniuConfig.feimu.bucket.cut,
            created_at: new Date().zoneDate()
          }
          uploadItems.push(item);
          ffmpeg.info(row.file_path, callback);
        }
      });
    },
    //jpg图
    (metadata, callback) => {
      var options = {
        frames: 1
      };
      ffmpeg.execution(row.file_path, row.jpg_path, options, (err, result) => {
        if (err) {
          row.cut_status = -1;
          db.updateTable('mv_feimu', 'id', [row], callback);
        } else {
          var item = {
            instance_id: scheduleOptions.instance_id,
            feimu_code: row.feimu_code,
            file_name: row.jpg_name,
            file_path: row.jpg_path,
            qiniu_zone: qiniuConfig.feimu.zone,
            qiniu_bucket: qiniuConfig.feimu.bucket.jpg,
            created_at: new Date().zoneDate()
          }
          uploadItems.push(item);
          callback(null, metadata);
        }
      });
    },
    //gif图
    (metadata, callback) => {
      var options = {
        "fps": ffmpegConfig.thumbnail.fps,
        "duration": ffmpegConfig.thumbnail.duration
      };
      var vidoeStream = ffmpeg.getVideoStream(metadata.streams);
      var width = vidoeStream.width;
      var height = vidoeStream.height;
      var resize = ffmpegConfig.thumbnail.resize;
      //长和宽必须是偶数
      if (resize && width > resize.width && height > resize.height) {
        if (width * resize.height >= height * resize.width) {
          var fixedWidth = 2 * Math.round(width * resize.height / (height * 2));
          options.size = fixedWidth + 'x' + resize.height;
        } else {
          var fixedHeight = 2 * Math.round(height * resize.width / (width * 2));
          options.size = width + 'x' + fixedHeight;
        }
      } else {
        options.size = width + 'x' + height;
      }
      ffmpeg.execution(row.file_path, row.gif_path, options, (err, result) => {
        if (err) {
          row.cut_status = -1;
          db.updateTable('mv_feimu', 'id', [row], callback);
        } else {
          var item = {
            instance_id: scheduleOptions.instance_id,
            feimu_code: row.feimu_code,
            file_name: row.gif_name,
            file_path: row.gif_path,
            qiniu_zone: qiniuConfig.feimu.zone,
            qiniu_bucket: qiniuConfig.feimu.bucket.jpg,
            created_at: new Date().zoneDate()
          }
          uploadItems.push(item);
          db.insertIgnoreTable('mv_feimu_upload', uploadItems, (err, results) => {
            if (err) {
              row.cut_status = -2;
              db.updateTable('mv_feimu', 'id', [row], callback);
            } else {
              row.cut_status = 1;
              row.updated_at = new Date().zoneDate();
              db.updateTable('mv_feimu', 'id', [row], callback);
            }
          });
        }
      });
    }
  ], (err, result) => {
    if (err) {
      if (err.message.indexOf('No such file or directory') != -1) {
        //源文件缺失
        row.cut_status = -2;
        db.updateTable('mv_feimu', 'id', [row], callback);
      } else if (err.message.indexOf('Invalid data found when processing input') != -1) {
        //源文件缺失
        row.cut_status = -1;
        db.updateTable('mv_feimu', 'id', [row], callback);
      } else {
        callback(err, null);
      }
    } else {
      callback(null, result);
    }
  });
};

module.exports.uploadFiemuCut = (row, callback) => {
  qiniu.uploadFile(row.file_name, row.file_path, row.qiniu_bucket, (err, body, info) => {
    if (err) {
      callback(err, null);
    } else {
      if (body && body.hash && body.key) {
        row.qiniu_zone = row.qiniu_zone;
        row.qiniu_bucket = row.qiniu_bucket;
        row.qiniu_hash = body.hash;
        row.qiniu_key = body.key;
        row.updated_at = new Date().zoneDate();
        db.updateTable('mv_feimu_upload', 'id', [row], callback);
      } else {
        callback(null, 'qiniu upload error:' + body);
      }
    }
  });
};
