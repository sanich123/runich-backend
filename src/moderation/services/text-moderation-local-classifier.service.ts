import { Injectable } from '@nestjs/common';
import { resolve } from 'node:path';
import { parseHuggingFaceLabels } from './text-moderation-worker.utils';

@Injectable()
export class TextModerationLocalClassifierService {
  private classifierPromise?: ReturnType<typeof this.loadClassifier>;

  async classify(text: string) {
    const classifier = await (this.classifierPromise ??= this.loadClassifier().catch((error: unknown) => {
      this.classifierPromise = undefined;
      throw error;
    }));
    const payload = await classifier(text, { top_k: 2 });
    const labels = parseHuggingFaceLabels(payload);
    if (!labels.some(({ label }) => label === 'toxic')) {
      throw new Error('Локальная модель не вернула категорию toxic с оценкой');
    }
    return labels;
  }

  private async loadClassifier() {
    const { env, pipeline } = await import('@huggingface/transformers');
    env.allowRemoteModels = false;
    env.allowLocalModels = true;

    const modelPath =
      process.env.TEXT_MODERATION_ONNX_MODEL_PATH?.trim() || resolve(process.cwd(), 'models/text-moderation');
    return pipeline('text-classification', modelPath, {
      dtype: 'q8',
      local_files_only: true,
    });
  }
}
