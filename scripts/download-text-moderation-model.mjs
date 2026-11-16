import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { promisify } from 'node:util';
import { dirname, resolve } from 'node:path';

const execFileAsync = promisify(execFile);
const modelId = 'onnx-community/distilbert-multilingual-toxicity-classifier-ONNX';
const revision = '4fbacce';
const modelLicenseId = 'gravitee-io/distilbert-multilingual-toxicity-classifier';
const modelLicenseRevision = '865ad1b';
const modelFile = 'onnx/model_quantized.onnx';
const expectedModelSize = 135_908_348;
const expectedModelSha256 = '52e703cb3d8a3aac8c5d35a350dbc20fd5f0a54b00f01b4b88fc5bb2052f7700';
const modelDirectory = process.env.TEXT_MODERATION_ONNX_MODEL_PATH?.trim() || resolve('models/text-moderation');
const files = [
  { file: 'LICENSE', repo: modelLicenseId, revision: modelLicenseRevision },
  ...[
    'config.json',
    'special_tokens_map.json',
    'tokenizer.json',
    'tokenizer_config.json',
    'vocab.txt',
    modelFile,
  ].map((file) => ({ file, repo: modelId, revision })),
];

async function getSha256(filePath) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

async function hasValidModel(filePath) {
  try {
    const fileStats = await stat(filePath);
    return fileStats.size === expectedModelSize && (await getSha256(filePath)) === expectedModelSha256;
  } catch {
    return false;
  }
}

await mkdir(modelDirectory, { recursive: true });
for (const { file, repo, revision: fileRevision } of files) {
  const destination = resolve(modelDirectory, file);
  if (file === modelFile) {
    if (await hasValidModel(destination)) continue;
  } else {
    try {
      if ((await stat(destination)).size > 0) continue;
    } catch {
      // The file is downloaded below when it is not present.
    }
  }

  await mkdir(dirname(destination), { recursive: true });
  const temporaryFile = `${destination}.download`;
  const url = `https://huggingface.co/${repo}/resolve/${fileRevision}/${file}?download=true`;

  try {
    await execFileAsync(
      'curl',
      [
        '--fail',
        '--location',
        '--retry',
        '3',
        '--retry-delay',
        '2',
        '--retry-all-errors',
        '--max-time',
        '180',
        '--silent',
        '--show-error',
        '--output',
        temporaryFile,
        url,
      ],
      { maxBuffer: 1024 * 1024 },
    );

    if (file === modelFile) {
      const fileStats = await stat(temporaryFile);
      const sha256 = await getSha256(temporaryFile);
      if (fileStats.size !== expectedModelSize || sha256 !== expectedModelSha256) {
        throw new Error(
          `Integrity check failed for ${file}: size=${fileStats.size}, sha256=${sha256}; expected size=${expectedModelSize}, sha256=${expectedModelSha256}`,
        );
      }
    }

    await rename(temporaryFile, destination);
    process.stdout.write(`Downloaded ${file}\n`);
  } catch (error) {
    await rm(temporaryFile, { force: true });
    throw error;
  }
}

process.stdout.write(`Local moderation model ready at ${modelDirectory}\n`);
