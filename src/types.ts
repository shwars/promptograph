export type ImageSize = '1024x1024' | '1024x1536' | '1536x1024';

export type CaptureOrientation = 'portrait' | 'landscape';

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

export type LightSetting = 'studio' | 'sharp' | 'soft' | 'ambient' | 'back light';
export type FocalLengthSetting = '24mm' | '35mm' | '50mm' | '85mm';
export type ExposureSetting = 'low' | 'balanced' | 'bright';
export type ModeSetting = 'portrait' | 'landscape' | 'sport' | 'artistic';

export type PhotoSettings = {
  light: LightSetting;
  focalLength: FocalLengthSetting;
  exposure: ExposureSetting;
  mode: ModeSetting;
};

export type HistoryRecord = {
  id: string;
  sourceId: string;
  createdAt: string;
  promptText: string;
  sourceImageDataUrl: string;
  generatedImageDataUrl: string;
  photoSettings: PhotoSettings;
  orientation: CaptureOrientation;
  sourceWidth: number;
  sourceHeight: number;
};
