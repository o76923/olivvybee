import path from 'path';
import fs from 'fs';

import svg2imgWithCallback, { svg2imgOptions } from 'svg2img';
import yargs from 'yargs';
import cliProgress, { Presets } from 'cli-progress';

const DEFAULT_SIZE = 256;

const gitignorePath = path.resolve('.', '.gitignore');
const gitignoreItems = fs.readFileSync(gitignorePath, 'utf-8').split('\n');

const parentDir = path.resolve('.');
const ALL_DIRECTORIES = fs
  .readdirSync(parentDir)
  .filter((filename) => fs.statSync(filename).isDirectory())
  .filter((filename) => !gitignoreItems.includes(filename))
  .filter((name) => !name.startsWith('.') && name !== 'scripts');

const svg2img = (svg: string, options?: svg2imgOptions): Promise<any> =>
  new Promise((resolve, reject) =>
    svg2imgWithCallback(svg, options, (err, buffer) => {
      if (err) {
        reject(err);
      }
      resolve(buffer);
    })
  );

interface GenerateArgs {
  svgPath: string;
  pngPath: string;
  size: number;
}

const generate = async ({ svgPath, pngPath, size }: GenerateArgs) => {
  const buffer = await svg2img(svgPath, {
    resvg: {
      fitTo: {
        mode: 'width',
        value: size,
      },
    },
  });

  fs.writeFileSync(pngPath, buffer);
};

const getParamsForSvgs = (
  svgDir: string,
  pngDir: string,
  size: number
): GenerateArgs[] => {
  const svgs = fs
    .readdirSync(svgDir)
    .filter((filename) => filename.endsWith('.svg'));

  if (!fs.existsSync(pngDir)) {
    fs.mkdirSync(pngDir, { recursive: true });
  }

  return svgs.map((filename) => ({
    svgPath: path.resolve(svgDir, filename),
    pngPath: path.resolve(pngDir, filename.replace('.svg', '.png')),
    size,
  }));
};

interface RunArgs {
  directories?: string[];
  size?: number;
}

const run = async ({
  directories = ALL_DIRECTORIES,
  size = DEFAULT_SIZE,
}: RunArgs) => {
  const generationParams = directories.flatMap((dir) => {
    const svgDir = path.resolve('.', dir);
    const pngDir = path.resolve('.', 'png', dir);
    return getParamsForSvgs(svgDir, pngDir, size);
  });

  const progress = new cliProgress.MultiBar({}, Presets.shades_classic);
  const progressBar = progress.create(generationParams.length, 0);

  for (const params of generationParams) {
    await generate(params);
    progress.log(
      `${params.svgPath.split('/').at(-1)} -> ${params.pngPath
        .split('/')
        .at(-1)}\n`
    );
    progressBar.increment();
  }

  progress.remove(progressBar);
  progress.stop();
};

const argv = yargs(process.argv)
  .option('directories', {
    alias: 'd',
    type: 'string',
    description: 'Input directories containing SVGs',
    array: true,
    choices: ALL_DIRECTORIES,
  })
  .option('size', {
    alias: 's',
    type: 'number',
    description: 'The size to generate PNGs at, in pixels',
    default: DEFAULT_SIZE,
  })
  .parseSync();

run(argv);
