import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(92);
Config.setCodec('h264');
Config.setCrf(18);
// Captures and voices are generated into public/gen/ by tools/; keep them out of the watcher's way.
Config.setOverwriteOutput(true);
