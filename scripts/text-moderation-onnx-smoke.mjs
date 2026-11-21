import { resolve } from 'node:path';
import { env, pipeline } from '@huggingface/transformers';

env.allowRemoteModels = false;
env.allowLocalModels = true;

const modelPath = process.env.TEXT_MODERATION_ONNX_MODEL_PATH?.trim() || resolve('models/text-moderation');
const classifier = await pipeline('text-classification', modelPath, {
  dtype: 'q8',
  local_files_only: true,
  session_options: {
    intraOpNumThreads: 1,
    interOpNumThreads: 1,
    executionMode: 'sequential',
  },
});

const output = await classifier('Проверка доступности локальной модели.', { top_k: 2 });
const labels = Array.isArray(output) && Array.isArray(output[0]) ? output.flat() : output;
const toxicLabel = Array.isArray(labels)
  ? labels.find(
      (label) =>
        typeof label === 'object' &&
        label !== null &&
        'label' in label &&
        typeof label.label === 'string' &&
        label.label.toLowerCase() === 'toxic' &&
        'score' in label &&
        typeof label.score === 'number' &&
        Number.isFinite(label.score) &&
        label.score >= 0 &&
        label.score <= 1,
    )
  : undefined;

if (!toxicLabel) {
  throw new Error('ONNX inference did not return a valid toxic score');
}

process.stdout.write('Text moderation ONNX smoke inference passed.\n');
