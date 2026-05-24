import type { Embedder } from './embedding.js';

/**
 * Lazy-loading transformer.js embedder.
 *
 * The model is downloaded on first use and cached in
 * ~/.cache/huggingface (or platform equivalent).  Default model is
 * Xenova/all-MiniLM-L6-v2 — 384 dims, ~22 MB, fast on CPU.
 *
 * We don't import @xenova/transformers at the top of the file because:
 *   1. It's an optional dependency (CLI flag, opt-in).
 *   2. It pulls in onnxruntime which is heavyweight and slow to load.
 *   3. Tests use the fake embedder and should never trigger this.
 */
export interface TransformersOptions {
  /** Hugging Face model id.  Default 'Xenova/all-MiniLM-L6-v2'. */
  model?: string;
  /** Pipeline quantization.  Default true for smaller download. */
  quantized?: boolean;
}

export function createTransformersEmbedder(options: TransformersOptions = {}): Embedder {
  const modelId = options.model ?? 'Xenova/all-MiniLM-L6-v2';
  const quantized = options.quantized ?? true;
  let pipelinePromise: Promise<unknown> | null = null;

  return {
    async embed(texts: string[]): Promise<Float32Array[]> {
      if (!pipelinePromise) {
        pipelinePromise = loadPipeline(modelId, quantized);
      }
      const pipe = (await pipelinePromise) as (
        texts: string[],
        opts: { pooling: string; normalize: boolean },
      ) => Promise<{ data: Float32Array; dims: number[] }>;
      const out = await pipe(texts, { pooling: 'mean', normalize: true });
      // out.data is a flat Float32Array of shape [batch, dim]; split it back.
      const [batch, dim] = out.dims;
      const result: Float32Array[] = [];
      for (let i = 0; i < batch; i++) {
        result.push(out.data.slice(i * dim, (i + 1) * dim));
      }
      return result;
    },
  };
}

async function loadPipeline(modelId: string, quantized: boolean): Promise<unknown> {
  const t = (await import('@xenova/transformers')) as unknown as {
    pipeline: (...a: unknown[]) => Promise<unknown>;
  };
  return t.pipeline('feature-extraction', modelId, { quantized });
}
