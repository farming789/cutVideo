
准备项
```
sudo apt-get remove ffmpeg x264 libav-tools libvpx-dev libx264-dev
sudo apt-get update
sudo apt-get upgrade
sudo apt-get install build-essential checkinstall git libfaac-dev libgpac-dev   libjack-jackd2-dev libmp3lame-dev libopencore-amrnb-dev libopencore-amrwb-dev   librtmp-dev libsdl1.2-dev libtheora-dev libva-dev libvdpau-dev libvorbis-dev   libx11-dev libxfixes-dev pkg-config texi2html yasm zlib1g-dev
sudo apt-get install libavcodec-dev libavformat-dev libavutil-dev
sudo apt-get install libx264-dev libfdk-aac-dev libmp3lame-dev libopencore-amrnb-dev libass-dev libopus-dev librtmp-dev libvpx-dev
sudo apt-get install cmake mercurial
mkdir software
hg clone https://bitbucket.org/multicoreware/x265
cd x265/build/linux/
PATH="$HOME/bin:$PATH" cmake -G "Unix Makefiles" -DCMAKE_INSTALL_PREFIX="$HOME/ffmpeg_build" -DENABLE_SHARED:bool=off ../../source
make
make install
```

安装ffmpeg
从这下载 http://ffmpeg.org/download.html
例如：ffmpeg_2.8.15.orig.tar.xz

```
sudo apt-get install xz-utils
xz -d ffmpeg_2.8.15.orig.tar.xz
tar -xvf ffmpeg_2.8.15.orig.tar
cd ffmpeg-2.8.15/

PATH="$HOME/bin:$PATH" PKG_CONFIG_PATH="$HOME/ffmpeg_build/lib/pkgconfig" ./configure   --prefix="$HOME/ffmpeg_build"   --pkg-config-flags="--static"   --extra-cflags="-I$HOME/ffmpeg_build/include"   --extra-ldflags="-L$HOME/ffmpeg_build/lib"   --bindir="$HOME/bin"   --enable-gpl   --enable-libass   --enable-libfdk-aac   --enable-libfreetype   --enable-libmp3lame   --enable-libopencore-amrnb   --enable-libopencore-amrwb   --enable-libopus   --enable-libtheora   --enable-libvorbis   --enable-libvpx   --enable-libx264   --enable-libx265   --enable-nonfree   --enable-version3

PATH="$HOME/bin:$PATH" make
make install
hash -r
```
