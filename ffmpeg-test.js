var async = require('async');
var ffmpeg = require('./lib/ffmpeg');
var acrcloud = require('./lib/acrcloud');
var qiniu = require('./lib/qiniu');
var config = require('./config/ffmpeg');

var cut = (item, callback) => {
  ffmpeg.execution(item.src, item.save, item.options, callback);
}

var mediaJob = (row, callback) => {
  console.log('media job begin');
  var fileName = row.file_path.split('.')[0];
  var extention = row.file_path.split('.')[1];
  async.waterfall([
    //先获取基本信息
    (callback) => {
      ffmpeg.info(config.basePath.src + row.file_path, callback);
    },
    //抽取音频
    // (metadata, callback) => {
    //   var options = {
    //     "noVideo": true,
    //     "audioCodec": 'copy'
    //   }
    //   ffmpeg.execution(config.basePath.src + row.file_path, config.basePath.save + fileName + '.m4a', options, (err, result) => {
    //     if (err) {
    //       callback(err, null);
    //     } else {
    //       上传acrcloud
    //       row.noVideo = true;
    //       row.audioPath = config.basePath.save + fileName + '.m4a';
    //       acrcloud.uploadAudio({
    //         endpoint: '/v1/audios',
    //         data_type: 'audio',
    //         audio_file: row.audioPath,
    //         audio_id: fileName + '.m4a',
    //         title: fileName
    //       }, (err, httpResponse, body) => {
    //         if (err) {
    //           console.log(err);
    //         } else {
    //           row.acrcloud = body;
    //         }
    //         callback(null, metadata);
    //       });
    //     }
    //   });
    // },
    //降低码率
    // (metadata, callback) => {
    //   if (metadata.streams.length >= 2 && metadata.streams[0].codec_type == 'video') {
    //     处理视频
    //     var stream = metadata.streams[0];
    //     var width = stream.width;
    //     var height = stream.height;
    //     var resize = config.resize[row.resize];
    //     if (resize && width > resize.width && height > resize.height) {
    //       源文件分辨率大于制定格式
    //       var options = {
    //         fps: resize.fps,
    //         vbr: resize.vbr
    //       }
    //       if (width * resize.height >= height * resize.width) {
    //         源视频宽高比大于目标制式宽高比，取高度下限
    //         var fixedWidth = width * resize.height / height;
    //         options.size = fixedWidth + 'x' + resize.height;
    //       } else {
    //         源视频宽高比小于目标制式宽高比，取宽度下限
    //         var fixedHeight = height * resize.width / width;
    //         options.size = width + 'x' + fixedHeight;
    //       }
    //       ffmpeg.execution(config.basePath.src + row.file, config.basePath.save + fileName + '-' + options.size + '.mp4', options, (err, result) => {
    //         if (err) {
    //           callback(err, null);
    //         } else {
    //           row.resize = true;
    //           row.resize_file_path = config.basePath.save + fileName + '-' + options.size + '.mp4';
    //           callback(null, metadata);
    //         }
    //       });
    //     } else {
    //       row.resize = false;
    //       callback(null, metadata);
    //     }
    //   }
    // },
    //剪切视频
    // (metadata, callback) => {
    //   if (metadata.format) {
    //     row.duration = Math.floor(metadata.format.duration + 1);
    //     row.size = metadata.format.size;
    //     row.start_time = row.start_time;
    //     row.bit_rate = row.bit_rate;
    //     var block = (row.duration - config.cut.duration) % config.cut.interval
    //       ? Math.round((row.duration - config.cut.duration) / config.cut.interval) + 1
    //       : (row.duration - config.cut.duration) / config.cut.interval + 1;
    //     var opts = [];
    //     for (var i = 0; i < block; i++) {
    //       var item = {
    //         src: config.basePath.src + row.file,
    //         save: config.basePath.save + fileName + '-cut-' + config.cut.duration + '-' + config.cut.interval + '-' + i + '.mp4',
    //         options: {
    //           startTime: i * config.cut.interval,
    //           duration: (i != block - 1)
    //             ? config.cut.duration
    //             : 0
    //         }
    //       }
    //       opts.push(item);
    //     }
    //     async.map(opts, cut, callback);
    //   }
    // },
    //七牛云上传
    (metadata, callback) => {
      var srcPath = metadata.format.filename;
      qiniu.uploadFile(row.file, srcPath);
    }
  ], (err, result) => {
    if (err) {
      console.log(err);
    } else {
      console.log('media job end');
    }
    if (callback) {
      callback(err, result);
    }
  });
};

(() => {
  var row = {
    file_path: 's2-cut-640x360.mp4',
    resize: '360p'
  }
  // ffmpeg.info('./data/s1-cut-15-1.mp4',(err,metadata) => {
  //   if (err) {
  //     console.log(err);
  //   } else {
  //     if (metadata.streams.length >=2 ){
  //       音视频文件
  //       var stream = metadata.streams[0];
  //       if (stream.codec_type == 'video') {
  //         视频文件
  //         var width = stream.width;
  //         var height = stream.height;
  //       }
  //     }
  //   }
  // });
  mediaJob(row, (err, result) => {
    if (err) {
      console.log(err);
    } else {
      console.log(row);
    }
  })
})();
