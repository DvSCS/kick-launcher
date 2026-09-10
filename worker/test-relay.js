const ffmpeg = require('fluent-ffmpeg');
const { PassThrough } = require('stream');
const path = require('path');
const os = require('os');

const ffmpegPath = path.join(__dirname, 'node_modules', 'ffmpeg-static', os.platform() === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
ffmpeg.setFfmpegPath(ffmpegPath);

const stream = new PassThrough();

const relay = ffmpeg(stream)
  .inputOptions([
    '-f mpegts',
    '-use_wallclock_as_timestamps 1'
  ])
  .outputOptions([
    '-c:v copy',
    '-c:a copy',
    '-f flv'
  ])
  .output('rtmp://test') // Doesn't matter, just testing if it builds and runs
  .on('start', (cmd) => console.log('Relay started:', cmd))
  .on('error', (err) => console.error('Relay error:', err.message));
  
relay.run();

const content = ffmpeg('http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4')
  .outputOptions([
    '-c:v libx264',
    '-preset ultrafast',
    '-s 1280x720',
    '-c:a aac',
    '-f mpegts'
  ])
  .on('start', (cmd) => console.log('Content started:', cmd))
  .on('error', (err) => console.error('Content error:', err.message));

content.pipe(stream, { end: false });

setTimeout(() => {
  console.log('Restarting content...');
  content.kill('SIGKILL');
  
  const content2 = ffmpeg('http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4')
  .outputOptions([
    '-c:v libx264',
    '-preset ultrafast',
    '-s 1280x720',
    '-c:a aac',
    '-f mpegts'
  ])
  .on('start', (cmd) => console.log('Content2 started:', cmd));
  
  content2.pipe(stream, { end: false });
}, 5000);
