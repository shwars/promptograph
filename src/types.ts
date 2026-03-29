export type ImageSize = '1024x1024' | '1024x1536' | '1536x1024';

export type PromptDraft = {
  subject: string;
  scene: string;
  composition: string;
  lighting: string;
  colorPalette: string;
  cameraDetails: string;
  styleAndTexture: string;
  negativeConstraints: string;
  fullPrompt: string;
};
