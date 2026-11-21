import { jest } from '@jest/globals';

const mockEnvironment = { allowRemoteModels: true, allowLocalModels: false };
const mockClassifier = jest.fn(async () => [
  { label: 'not-toxic', score: 0.99 },
  { label: 'toxic', score: 0.01 },
]);
const mockPipeline = jest.fn(async () => mockClassifier);

jest.unstable_mockModule('@huggingface/transformers', () => ({
  env: mockEnvironment,
  pipeline: mockPipeline,
}));

const { TextModerationLocalClassifierService } = await import('../services/text-moderation-local-classifier.service');

describe('TextModerationLocalClassifierService', () => {
  const originalModelPath = process.env.TEXT_MODERATION_ONNX_MODEL_PATH;

  beforeEach(() => {
    process.env.TEXT_MODERATION_ONNX_MODEL_PATH = '/tmp/runich-local-toxicity-model';
    mockEnvironment.allowRemoteModels = true;
    mockEnvironment.allowLocalModels = false;
    mockClassifier.mockReset().mockResolvedValue([
      { label: 'not-toxic', score: 0.99 },
      { label: 'toxic', score: 0.01 },
    ]);
    mockPipeline.mockReset().mockResolvedValue(mockClassifier);
  });

  afterEach(() => {
    if (originalModelPath === undefined) delete process.env.TEXT_MODERATION_ONNX_MODEL_PATH;
    else process.env.TEXT_MODERATION_ONNX_MODEL_PATH = originalModelPath;
  });

  it('loads the pinned local quantized model once and returns both classification labels', async () => {
    const service = new TextModerationLocalClassifierService();

    await expect(service.classify('First comment')).resolves.toEqual([
      { label: 'not-toxic', score: 0.99 },
      { label: 'toxic', score: 0.01 },
    ]);
    await service.classify('Second comment');

    expect(mockPipeline).toHaveBeenCalledTimes(1);
    expect(mockPipeline).toHaveBeenCalledWith('text-classification', '/tmp/runich-local-toxicity-model', {
      dtype: 'q8',
      local_files_only: true,
      session_options: {
        intraOpNumThreads: 1,
        interOpNumThreads: 1,
        executionMode: 'sequential',
      },
    });
    expect(mockClassifier).toHaveBeenNthCalledWith(1, 'First comment', { top_k: 2 });
    expect(mockClassifier).toHaveBeenNthCalledWith(2, 'Second comment', { top_k: 2 });
    expect(mockEnvironment).toEqual({ allowRemoteModels: false, allowLocalModels: true });
  });

  it('retries model loading after an initialization failure', async () => {
    mockPipeline.mockRejectedValueOnce(new Error('missing model files')).mockResolvedValueOnce(mockClassifier);
    const service = new TextModerationLocalClassifierService();

    await expect(service.classify('First comment')).rejects.toThrow('missing model files');
    await expect(service.classify('Second comment')).resolves.toHaveLength(2);

    expect(mockPipeline).toHaveBeenCalledTimes(2);
  });
});
