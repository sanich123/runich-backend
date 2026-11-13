import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { dirname, resolve } from 'node:path';

const modelId = 'onnx-community/distilbert-multilingual-toxicity-classifier-ONNX';
const revision = '4fbacce';
const modelLicenseId = 'gravitee-io/distilbert-multilingual-toxicity-classifier';
const modelLicenseRevision = '865ad1b';
const modelDirectory = process.env.TEXT_MODERATION_ONNX_MODEL_PATH?.trim() || resolve('models/text-moderation');
const files = [
  { file: 'LICENSE', repo: modelLicenseId, revision: modelLicenseRevision },
  ...[
    'config.json',
    'special_tokens_map.json',
    'tokenizer.json',
    'tokenizer_config.json',
    'vocab.txt',
    'onnx/model_quantized.onnx',
  ].map((file) => ({ file, repo: modelId, revision })),
];

await mkdir(modelDirectory, { recursive: true });
for (const { file, repo, revision: fileRevision } of files) {
  const destination = resolve(modelDirectory, file);
  try {
    if ((await stat(destination)).size > 0) continue;
  } catch {
    // The file is downloaded below when it is not present.
  }

  await mkdir(dirname(destination), { recursive: true });
  const temporaryFile = `${destination}.download`;
  const url = `https://huggingface.co/${repo}/resolve/${fileRevision}/${file}?download=true`;
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok || !response.body) {
    throw new Error(`Не удалось скачать ${file}: Hugging Face вернул HTTP ${response.status}`);
  }

  try {
    await pipeline(Readable.fromWeb(response.body), createWriteStream(temporaryFile));
    await rename(temporaryFile, destination);
    process.stdout.write(`Downloaded ${file}\n`);
  } catch (error) {
    await rm(temporaryFile, { force: true });
    throw error;
  }
}

process.stdout.write(`Local moderation model ready at ${modelDirectory}\n`);
