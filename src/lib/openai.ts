import type { ImageSize, PhotoSettings, PromptDraft } from '../types';

const OPENAI_API_URL = 'https://api.openai.com/v1';
const ANALYSIS_MODEL = 'gpt-4.1-mini';
const REWRITE_MODEL = 'gpt-4.1-mini';
const IMAGE_MODEL = 'gpt-image-1.5';

const EMPTY_DRAFT: PromptDraft = {
  subject: '',
  scene: '',
  composition: '',
  lighting: '',
  colorPalette: '',
  cameraDetails: '',
  styleAndTexture: '',
  negativeConstraints: '',
  fullPrompt: '',
};

const promptDraftSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'subject',
    'scene',
    'composition',
    'lighting',
    'colorPalette',
    'cameraDetails',
    'styleAndTexture',
    'negativeConstraints',
    'fullPrompt',
  ],
  properties: {
    subject: { type: 'string' },
    scene: { type: 'string' },
    composition: { type: 'string' },
    lighting: { type: 'string' },
    colorPalette: { type: 'string' },
    cameraDetails: { type: 'string' },
    styleAndTexture: { type: 'string' },
    negativeConstraints: { type: 'string' },
    fullPrompt: { type: 'string' },
  },
} as const;

function buildHeaders(apiKey: string): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
}

function extractErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object') {
    const maybeError = payload as { error?: { message?: string } };
    if (maybeError.error?.message) {
      return maybeError.error.message;
    }
  }

  return fallback;
}

async function openAiFetch<T>(path: string, apiKey: string, body: unknown): Promise<T> {
  const response = await fetch(`${OPENAI_API_URL}${path}`, {
    method: 'POST',
    headers: buildHeaders(apiKey),
    body: JSON.stringify(body),
  });

  const json = await response.json();
  if (!response.ok) {
    throw new Error(extractErrorMessage(json, `OpenAI request failed with ${response.status}.`));
  }

  return json as T;
}

function extractOutputText(response: unknown): string {
  if (response && typeof response === 'object') {
    const directText = (response as { output_text?: string }).output_text;
    if (typeof directText === 'string' && directText.trim()) {
      return directText.trim();
    }

    const output = (response as { output?: unknown[] }).output;
    if (Array.isArray(output)) {
      const textParts = output.flatMap((item) => {
        if (!item || typeof item !== 'object') {
          return [];
        }

        const content = (item as { content?: unknown[] }).content;
        if (!Array.isArray(content)) {
          return [];
        }

        return content
          .map((entry) => {
            if (!entry || typeof entry !== 'object') {
              return '';
            }

            const maybeText = entry as { text?: string };
            return typeof maybeText.text === 'string' ? maybeText.text : '';
          })
          .filter(Boolean);
      });

      if (textParts.length > 0) {
        return textParts.join('\n').trim();
      }
    }
  }

  throw new Error('OpenAI response did not include text output.');
}

function sanitizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function composeFullPrompt(draft: PromptDraft): string {
  const parts = [
    `Subject: ${sanitizeText(draft.subject)}`,
    `Scene and environment: ${sanitizeText(draft.scene)}`,
    `Composition and framing: ${sanitizeText(draft.composition)}`,
    `Lighting: ${sanitizeText(draft.lighting)}`,
    `Color palette: ${sanitizeText(draft.colorPalette)}`,
    `Camera and optics: ${sanitizeText(draft.cameraDetails)}`,
    `Style and textures: ${sanitizeText(draft.styleAndTexture)}`,
  ].filter((part) => !part.endsWith(':'));

  const negatives = sanitizeText(draft.negativeConstraints);
  if (negatives) {
    parts.push(`Avoid: ${negatives}`);
  }

  return parts.join('. ');
}

function normalizeDraft(candidate: Partial<PromptDraft>): PromptDraft {
  const draft = {
    ...EMPTY_DRAFT,
    ...candidate,
  };

  return {
    subject: draft.subject.trim(),
    scene: draft.scene.trim(),
    composition: draft.composition.trim(),
    lighting: draft.lighting.trim(),
    colorPalette: draft.colorPalette.trim(),
    cameraDetails: draft.cameraDetails.trim(),
    styleAndTexture: draft.styleAndTexture.trim(),
    negativeConstraints: draft.negativeConstraints.trim(),
    fullPrompt: draft.fullPrompt.trim(),
  };
}

export async function analyzePhoto(apiKey: string, imageDataUrl: string): Promise<PromptDraft> {
  const payload = {
    model: ANALYSIS_MODEL,
    input: [
      {
        role: 'system',
        content: [
          {
            type: 'input_text',
            text:
              'You are an image-to-prompt specialist. Describe images for recreation by an image model, not for storytelling. Be concrete, specific, and visual. Focus on the subject, environment, lens feel, framing, lighting direction, colors, materials, surfaces, pose, and any details that materially affect reconstruction. Avoid brand names, unsupported guesses, and vague adjectives.',
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text:
              'Analyze this photo and return JSON only. Fill each field with concise but detailed visual instructions for recreating the image. The negativeConstraints field should list mistakes or artifacts to avoid. The fullPrompt field should be a single polished prompt suitable for direct image generation.',
          },
          {
            type: 'input_image',
            image_url: imageDataUrl,
            detail: 'high',
          },
        ],
      },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'prompt_draft',
        schema: promptDraftSchema,
      },
    },
  };

  const response = await openAiFetch<unknown>('/responses', apiKey, payload);
  const rawText = extractOutputText(response);

  let parsed: Partial<PromptDraft>;
  try {
    parsed = JSON.parse(rawText) as Partial<PromptDraft>;
  } catch (error) {
    throw new Error(
      error instanceof Error ? `Could not parse analysis JSON: ${error.message}` : 'Could not parse analysis JSON.',
    );
  }

  const draft = normalizeDraft(parsed);
  if (!draft.fullPrompt) {
    draft.fullPrompt = composeFullPrompt(draft);
  }

  return draft;
}

export async function rewritePromptWithPhotoSettings(
  apiKey: string,
  promptText: string,
  photoSettings: PhotoSettings,
): Promise<string> {
  const payload = {
    model: REWRITE_MODEL,
    input: [
      {
        role: 'system',
        content: [
          {
            type: 'input_text',
            text:
              'You rewrite image generation prompts. Keep the scene, subject, and semantic content intact, but adjust the photographic language to reflect the requested lighting, focal length, exposure, and shooting mode. Return only the rewritten prompt text, with no markdown and no commentary.',
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: `Current prompt:\n${promptText}\n\nRequested photo settings:\n${JSON.stringify(photoSettings, null, 2)}`,
          },
        ],
      },
    ],
  };

  const response = await openAiFetch<unknown>('/responses', apiKey, payload);
  return extractOutputText(response);
}

type ImagesApiResponse = {
  data?: Array<{
    b64_json?: string;
  }>;
};

export async function renderImage(apiKey: string, prompt: string, size: ImageSize): Promise<string> {
  const payload = {
    model: IMAGE_MODEL,
    prompt,
    size,
    quality: 'medium',
    output_format: 'webp',
    output_compression: 90,
  };

  const response = await openAiFetch<ImagesApiResponse>('/images/generations', apiKey, payload);
  const imageBase64 = response.data?.[0]?.b64_json;

  if (!imageBase64) {
    throw new Error('OpenAI did not return image data.');
  }

  return `data:image/webp;base64,${imageBase64}`;
}
