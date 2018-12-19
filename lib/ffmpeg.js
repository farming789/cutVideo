var ffmpeg = require('fluent-ffmpeg');
var ffmpegConfig = require('../config/ffmpeg');

module.exports.info = (srcPath, callback) => {
  ffmpeg.ffprobe(srcPath, callback);
}

module.exports.execution = (srcPath, savePath, options, callback) => {
  var cmd = ffmpeg(srcPath);
  //切gif用到的调色板
  if (options.imagePatternPath) {
    cmd = cmd.input(options.imagePatternPath);
  }
  //开始时间
  if (options.startTime) {
    cmd = cmd.setStartTime(options.startTime);
  }
  //持续时间
  if (options.duration) {
    cmd = cmd.duration(options.duration);
  }
  //不提取音频（采集视频）
  if (options.noAudio) {
    cmd = cmd.noAudio();
  }
  //音频编码
  if (options.audioCodec) {
    cmd = cmd.audioCodec(options.audioCodec);
  }
  //音频码率
  if (options.audioBitrate) {
    cmd = cmd.audioBitrate(options.audioBitrate);
  }
  //音频采样率
  if (options.audioFrequency) {
    cmd = cmd.audioFrequency(options.audioFrequency);
  }
  //音频质量（VBR）
  if (options.vbr) {
    //cmd = cmd.audioCodec('libfdk_aac').audioQuality(options.vbr);
  }
  //不提取视频（采集音频）
  if (options.noVideo) {
    cmd = cmd.noVideo();
  }
  //视频编码
  if (options.videoCodec) {
    cmd = cmd.videoCodec(options.videoCodec);
  }
  //视频码率
  if (options.videoBitrate) {
    cmd = cmd.videoBitrate(options.videoBitrate);
  }
  //视频分辨率
  if (options.size) {
    cmd = cmd.size(options.size);
  }
  //视频帧率
  if (options.fps) {
    cmd = cmd.fps(options.fps);
  }

  //固定帧，用于截图
  if (options.frames) {
    cmd = cmd.frames(options.frames);
  }

  cmd.on('end', () => callback(null, savePath)).on('start', function(commandLine) {
    console.log('ffmpeg with command: ' + commandLine);
  }).on('error', (err, stdout, stderr) => callback(err.message,null)).on('stderr', stderrLine => {
    console.log(stderrLine);
  }).save(savePath);
};

(() => {
  ffmpegConfig.ffmpegPath && ffmpeg.setFfmpegPath(ffmpegConfig.ffmpegPath);
  ffmpegConfig.ffprobePath && ffmpeg.setFfprobePath(ffmpegConfig.ffprobePath);
})();
