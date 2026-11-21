import * as nsfwjs from 'nsfwjs';
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-cpu';

await tf.setBackend('cpu');
await tf.ready();

const modelUrl = process.env.NSFWJS_MODEL_URL?.trim();
const model = await nsfwjs.load(modelUrl || undefined);
const pixels = tf.tensor3d(new Uint8Array(224 * 224 * 3), [224, 224, 3], 'int32');

try {
  const predictions = await model.classify(pixels);
  const hasValidPornScore =
    Array.isArray(predictions) &&
    predictions.some(
      ({ className, probability }) =>
        className === 'Porn' &&
        typeof probability === 'number' &&
        Number.isFinite(probability) &&
        probability >= 0 &&
        probability <= 1,
    );

  if (!hasValidPornScore) {
    throw new Error('NSFWJS inference did not return a valid Porn score');
  }
} finally {
  pixels.dispose();
}

process.stdout.write('Media moderation NSFWJS smoke inference passed.\n');
