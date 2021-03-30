# xj-node
# 分布式并行切割视频，提取音频，上传到七牛云和acrCloud
# 技术：nodejs+ffmpeg

安装nvm
```bash
curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.34.0/install.sh | bash
```

使用nvm安装node
```bash
nvm install node
```

安装pm2
```bash
npm i pm2 -g
```

安装ffmpeg
参见ffmpeg编译安装.md

安装mysql5.7
```bash
sudo apt-get install mysql-server
```

下载arcCloud指纹提取工具
https://www.acrcloud.com/docs/acrcloud/fingerprinting-tools/audio-file-fingerprinting-tool/

七牛云视频切片程序

## 安装

```bash
$ npm install
```

## 配置文件

拷贝 `config.json.example` 到 `config.json`, 修改下列运行参数:

| 参数名称     | 描述       | 是否必须 |
| -------- | -------- | ---- |
| db       | 数据库      | 是    |
| acrcloud | acrloud云 | 是    |
| ffmpeg   | 视频处理     | 是    |
| qiniu    | 七牛云      | 是    |
| schedule | 定时任务参数   | 是    |

## 任务分解

-   noVideoJob：提取音频
-   uploadACRCloudJob：上传音频
-   resizeJob：降低码率
-   cutJob：视频切片
-   uploadQiniuJob：上传切片后视频

## 运行

-   方式一：启动定时任务

```bash
$ pm2 start pm2.json
```

-   方式二：单独执行一次job

```bash
$ node index.js noVideoJob
```

## 运维

```bash
$ pm2 list
$ pm2 logs {index}
```

## 表结构

| 表名          | 描述     |
| ----------- | ------ |
| mv_origin   | 视频源文件表 |
| mv_novideos | 抽取后的音频 |
| mv_resize   | 降码后的视频 |
| mv_cut      | 视频切片   |

## 视频处理流程：

1.  启动本项目
2.  将视频文件上传到`ffmpeg.basePath.src`对应文件夹下
3.  在`mv_origin`中新增一条记录，填写`file_path`,`file_title`,`resize`字段，所有`status`字段为0

## 支持的视频转码格式```resize```

- 1080p
- 720p
- 480p-16x9
- 480p-4x3
- 360p-16x9
- 360p-4x3
- 320x240

## async-acrloud.js

- 同步已经上传音频文件的处理状态（处理中-就绪）
- 远程删除mv_novideos表中del_status状态为1的音频
