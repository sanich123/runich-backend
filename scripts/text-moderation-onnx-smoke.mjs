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

async function getToxicScore(text) {
  const output = await classifier(text, { top_k: 2 });
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

  if (!toxicLabel)
    throw new Error(`ONNX inference did not return a valid toxic score for calibration sample ${JSON.stringify(text)}`);
  return toxicLabel.score;
}

const calibrationSamples = [
  { text: 'айос', maximumToxicScore: 0.99 },
  { text: 'iOS', maximumToxicScore: 0.99 },
  { text: 'Перешёл на айос', maximumToxicScore: 0.99 },
  { text: 'Айос удобный', maximumToxicScore: 0.99 },
  { text: 'Привет', maximumToxicScore: 0.99 },
  { text: 'лол', maximumToxicScore: 0.99 },
  { text: 'хз', maximumToxicScore: 0.99 },
  { text: 'спс', maximumToxicScore: 0.99 },
  { text: 'норм', maximumToxicScore: 0.99 },
  { text: 'фвыа', maximumToxicScore: 0.99 },
  { text: 'ывапролдж', maximumToxicScore: 0.99 },
  { text: 'asdf', maximumToxicScore: 0.99 },
  { text: 'qwerty', maximumToxicScore: 0.99 },
  { text: 'Сегодня хорошо потренировался, пробежал пять километров.', maximumToxicScore: 0.95 },
  { text: 'Сегодня настроение ужасное, тренировка не удалась.', maximumToxicScore: 0.95 },
  { text: 'Ты тупой и ничего не умеешь.', minimumToxicScore: 0.95 },
  { text: 'Ты идиот', minimumToxicScore: 0.99 },
  { text: 'Пошёл нахуй', minimumToxicScore: 0.99 },
];

for (const sample of calibrationSamples) {
  const toxicScore = await getToxicScore(sample.text);
  if (sample.maximumToxicScore !== undefined && toxicScore >= sample.maximumToxicScore) {
    throw new Error(`ONNX calibration false-positive sample exceeded its limit: ${JSON.stringify(sample.text)}`);
  }
  if (sample.minimumToxicScore !== undefined && toxicScore < sample.minimumToxicScore) {
    throw new Error(`ONNX calibration toxic sample did not reach its limit: ${JSON.stringify(sample.text)}`);
  }
}

process.stdout.write(
  `Text moderation ONNX smoke inference and ${calibrationSamples.length} calibration samples passed.\n`,
);
