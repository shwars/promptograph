import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { analyzePhoto, renderImage, rewritePromptWithPhotoSettings } from './lib/openai';
import { loadHistoryRecords, loadStoredApiKey, saveHistoryRecord, saveStoredApiKey } from './lib/storage';
import type { CaptureOrientation, HistoryRecord, ImageSize, PhotoSettings } from './types';

type Screen = 'camera' | 'review' | 'generated' | 'history' | 'settings';
type Overlay = 'apiKey' | 'promptEdit' | 'photoSettings' | null;
type IconName =
  | 'gallery'
  | 'history'
  | 'settings'
  | 'share'
  | 'download'
  | 'edit'
  | 'adjust'
  | 'generate'
  | 'close'
  | 'save'
  | 'trash'
  | 'camera'
  | 'back'
  | 'retry';

const LIGHT_OPTIONS: Array<PhotoSettings['light']> = ['studio', 'sharp', 'soft', 'ambient', 'back light'];
const FOCAL_LENGTH_OPTIONS: Array<PhotoSettings['focalLength']> = ['24mm', '35mm', '50mm', '85mm'];
const EXPOSURE_OPTIONS: Array<PhotoSettings['exposure']> = ['low', 'balanced', 'bright'];
const MODE_OPTIONS: Array<PhotoSettings['mode']> = ['portrait', 'landscape', 'sport', 'artistic'];

function getViewportOrientation(): CaptureOrientation {
  if (typeof window === 'undefined') {
    return 'portrait';
  }

  return window.innerHeight >= window.innerWidth ? 'portrait' : 'landscape';
}

function getImageOrientation(width: number, height: number): CaptureOrientation {
  return height >= width ? 'portrait' : 'landscape';
}

function getImageSizeForOrientation(orientation: CaptureOrientation): ImageSize {
  return orientation === 'portrait' ? '1024x1536' : '1536x1024';
}

function getDefaultPhotoSettings(orientation: CaptureOrientation): PhotoSettings {
  return {
    light: 'ambient',
    focalLength: '35mm',
    exposure: 'balanced',
    mode: orientation === 'portrait' ? 'portrait' : 'landscape',
  };
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [metadata, content] = dataUrl.split(',');
  const mimeMatch = metadata.match(/data:(.*?);base64/);
  const mimeType = mimeMatch?.[1] ?? 'image/jpeg';
  const binary = window.atob(content);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: mimeType });
}

function downloadDataUrl(dataUrl: string, fileName: string): void {
  const anchor = document.createElement('a');
  anchor.href = dataUrl;
  anchor.download = fileName;
  anchor.click();
}

async function shareImageDataUrl(dataUrl: string, fileName: string): Promise<void> {
  const navigatorWithShare = navigator as Navigator & {
    canShare?: (data?: ShareData) => boolean;
  };

  if (typeof navigatorWithShare.share === 'function') {
    const blob = dataUrlToBlob(dataUrl);
    const file = new File([blob], fileName, { type: blob.type || 'image/jpeg' });
    const shareData: ShareData = { files: [file], title: fileName };

    if (!navigatorWithShare.canShare || navigatorWithShare.canShare(shareData)) {
      try {
        await navigatorWithShare.share(shareData);
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
      }
    }
  }

  downloadDataUrl(dataUrl, fileName);
}

function Icon({ name }: { name: IconName }) {
  switch (name) {
    case 'gallery':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 5.5h4l1.2 1.5H20v11H4z" />
          <path d="M7.5 15.5l2.7-2.8 2.4 2.2 2.2-2.8 2.7 3.4" />
        </svg>
      );
    case 'history':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 12a8 8 0 1 0 2.3-5.7" />
          <path d="M4 4v4h4" />
          <path d="M12 8.5V12l2.8 1.8" />
        </svg>
      );
    case 'settings':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 8.5A3.5 3.5 0 1 0 12 15.5A3.5 3.5 0 1 0 12 8.5Z" />
          <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a2 2 0 0 1-4 0v-.2a1 1 0 0 0-.7-.9 1 1 0 0 0-1.1.2l-.1.1a2 2 0 0 1-2.8-2.8l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.7H4a2 2 0 0 1 0-4h.2a1 1 0 0 0 .9-.7 1 1 0 0 0-.2-1.1l-.1-.1a2 2 0 0 1 2.8-2.8l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .7-.9V4a2 2 0 0 1 4 0v.2a1 1 0 0 0 .7.9 1 1 0 0 0 1.1-.2l.1-.1a2 2 0 0 1 2.8 2.8l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.7H20a2 2 0 0 1 0 4h-.2a1 1 0 0 0-.4 1.6" />
        </svg>
      );
    case 'share':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 16V4" />
          <path d="M7.5 8.5L12 4l4.5 4.5" />
          <path d="M5 13.5v4A1.5 1.5 0 0 0 6.5 19h11a1.5 1.5 0 0 0 1.5-1.5v-4" />
        </svg>
      );
    case 'download':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 4v10" />
          <path d="M8 10.5L12 14.5l4-4" />
          <path d="M5 18.5h14" />
        </svg>
      );
    case 'edit':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 20l4.5-.8L18 9.7 14.3 6 4.8 15.5 4 20z" />
          <path d="M12.8 7.5l3.7 3.7" />
        </svg>
      );
    case 'adjust':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 7h8" />
          <path d="M15 7h5" />
          <path d="M11 7a2 2 0 1 0 0 .01" />
          <path d="M4 17h5" />
          <path d="M16 17h4" />
          <path d="M13 17a2 2 0 1 0 0 .01" />
        </svg>
      );
    case 'generate':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3l1.4 4.1L17.5 8.5l-4.1 1.4L12 14l-1.4-4.1L6.5 8.5l4.1-1.4z" />
          <path d="M18.5 14l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
          <path d="M7 15.5l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9z" />
        </svg>
      );
    case 'close':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 6l12 12" />
          <path d="M18 6L6 18" />
        </svg>
      );
    case 'save':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 12.5l4 4L19 7" />
        </svg>
      );
    case 'trash':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 7h16" />
          <path d="M9.5 4h5l1 3h-7z" />
          <path d="M7 7l1 12h8l1-12" />
          <path d="M10 11v5" />
          <path d="M14 11v5" />
        </svg>
      );
    case 'camera':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 8.5h3l1.4-2h7.2l1.4 2H20v9H4z" />
          <path d="M12 10a3.5 3.5 0 1 0 0 7 3.5 3.5 0 1 0 0-7Z" />
        </svg>
      );
    case 'back':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M15.5 5.5L8.5 12l7 6.5" />
        </svg>
      );
    case 'retry':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 12a8 8 0 1 0 2.3-5.7" />
          <path d="M4 4v4h4" />
        </svg>
      );
    default:
      return null;
  }
}

function IconButton({
  icon,
  label,
  onClick,
  variant = 'glass',
  disabled = false,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  variant?: 'glass' | 'accent' | 'danger';
  disabled?: boolean;
}) {
  return (
    <button className={`icon-button icon-button-${variant}`} onClick={onClick} aria-label={label} disabled={disabled} type="button">
      <Icon name={icon} />
    </button>
  );
}

function App() {
  const [apiKey, setApiKey] = useState('');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [screen, setScreen] = useState<Screen>('camera');
  const [overlay, setOverlay] = useState<Overlay>('apiKey');
  const [viewportOrientation, setViewportOrientation] = useState<CaptureOrientation>(getViewportOrientation());
  const [cameraStatus, setCameraStatus] = useState('Preparing camera...');
  const [cameraError, setCameraError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [sourceImage, setSourceImage] = useState('');
  const [sourceWidth, setSourceWidth] = useState(0);
  const [sourceHeight, setSourceHeight] = useState(0);
  const [sourceOrientation, setSourceOrientation] = useState<CaptureOrientation>('portrait');
  const [sourceId, setSourceId] = useState('');
  const [promptText, setPromptText] = useState('');
  const [promptEditorValue, setPromptEditorValue] = useState('');
  const [photoSettings, setPhotoSettings] = useState<PhotoSettings>(getDefaultPhotoSettings(getViewportOrientation()));
  const [draftPhotoSettings, setDraftPhotoSettings] = useState<PhotoSettings>(getDefaultPhotoSettings(getViewportOrientation()));
  const [generatedImage, setGeneratedImage] = useState('');
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isRewritingPrompt, setIsRewritingPrompt] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCameraLive, setIsCameraLive] = useState(false);
  const [keyDialogError, setKeyDialogError] = useState('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const activeSourceIdRef = useRef('');

  const isBusy = isAnalyzing || isRewritingPrompt || isGenerating;
  const selectedImageSize = useMemo(() => getImageSizeForOrientation(sourceOrientation), [sourceOrientation]);

  useEffect(() => {
    const storedKey = loadStoredApiKey();
    setApiKey(storedKey);
    setApiKeyInput(storedKey);
    setOverlay(storedKey ? null : 'apiKey');

    void (async () => {
      const records = await loadHistoryRecords();
      setHistory(records);
    })();
  }, []);

  useEffect(() => {
    const handleResize = () => setViewportOrientation(getViewportOrientation());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!apiKey || screen !== 'camera') {
      stopCamera();
      return;
    }

    void startCamera();
    return () => stopCamera();
  }, [apiKey, screen, viewportOrientation]);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setIsCameraLive(false);

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('This browser does not expose camera access.');
      setCameraStatus('Camera unavailable.');
      return;
    }

    setCameraError('');
    setCameraStatus('Requesting camera...');

    try {
      stopCamera();
      const portrait = viewportOrientation === 'portrait';
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: portrait ? 1536 : 2048 },
          height: { ideal: portrait ? 2048 : 1536 },
          aspectRatio: { ideal: portrait ? 0.75 : 1.33 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setIsCameraLive(true);
      setCameraStatus('Camera ready.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not access the camera on this device.';
      setCameraError(message);
      setCameraStatus('Camera unavailable.');
    }
  }

  async function refreshHistory() {
    const records = await loadHistoryRecords();
    setHistory(records);
  }

  async function beginReview(imageDataUrl: string, width: number, height: number) {
    const orientation = getImageOrientation(width, height);
    const nextSettings = getDefaultPhotoSettings(orientation);
    const nextSourceId = createId('source');

    activeSourceIdRef.current = nextSourceId;
    setSourceId(nextSourceId);
    setSourceImage(imageDataUrl);
    setSourceWidth(width);
    setSourceHeight(height);
    setSourceOrientation(orientation);
    setPhotoSettings(nextSettings);
    setDraftPhotoSettings(nextSettings);
    setPromptText('');
    setPromptEditorValue('');
    setGeneratedImage('');
    setScreen('review');
    setOverlay(null);
    setStatusMessage('');
    stopCamera();

    if (!apiKey) {
      setOverlay('apiKey');
      return;
    }

    setIsAnalyzing(true);
    try {
      const draft = await analyzePhoto(apiKey, imageDataUrl);
      if (activeSourceIdRef.current !== nextSourceId) {
        return;
      }

      setPromptText(draft.fullPrompt);
      setPromptEditorValue(draft.fullPrompt);
    } catch (error) {
      if (activeSourceIdRef.current !== nextSourceId) {
        return;
      }

      setStatusMessage(error instanceof Error ? error.message : 'Prompt generation failed.');
    } finally {
      if (activeSourceIdRef.current === nextSourceId) {
        setIsAnalyzing(false);
      }
    }
  }

  function captureFrame() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setStatusMessage('Camera preview is not ready yet.');
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      setStatusMessage('Could not capture this frame.');
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageDataUrl = canvas.toDataURL('image/jpeg', 0.92);
    void beginReview(imageDataUrl, canvas.width, canvas.height);
  }

  function handleGalleryLoad(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result) {
        setStatusMessage('Could not load the selected image.');
        return;
      }

      const image = new Image();
      image.onload = () => {
        void beginReview(result, image.width, image.height);
      };
      image.src = result;
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  }

  function saveApiKey() {
    const trimmed = apiKeyInput.trim();
    if (!trimmed) {
      setKeyDialogError('Enter a valid API key.');
      return;
    }

    saveStoredApiKey(trimmed);
    setApiKey(trimmed);
    setKeyDialogError('');
    setOverlay(null);
    setStatusMessage('API key saved on this device.');
  }

  function forgetApiKey() {
    saveStoredApiKey('');
    setApiKey('');
    setApiKeyInput('');
    setOverlay('apiKey');
    setScreen('camera');
    setStatusMessage('API key removed from this device.');
    stopCamera();
  }

  function resetToCamera() {
    activeSourceIdRef.current = '';
    setScreen('camera');
    setOverlay(null);
    setSourceImage('');
    setSourceWidth(0);
    setSourceHeight(0);
    setPromptText('');
    setPromptEditorValue('');
    setGeneratedImage('');
    setStatusMessage('');
  }

  function openPromptEditor() {
    setPromptEditorValue(promptText);
    setOverlay('promptEdit');
  }

  function savePromptEdit() {
    const nextPrompt = promptEditorValue.trim();
    if (!nextPrompt) {
      setStatusMessage('Prompt cannot be empty.');
      return;
    }

    setPromptText(nextPrompt);
    setOverlay(null);
  }

  function openPhotoSettingsEditor() {
    setDraftPhotoSettings(photoSettings);
    setOverlay('photoSettings');
  }

  async function applyPhotoSettings() {
    setPhotoSettings(draftPhotoSettings);
    if (!apiKey || !promptText.trim()) {
      setOverlay(null);
      return;
    }

    setIsRewritingPrompt(true);
    try {
      const rewrittenPrompt = await rewritePromptWithPhotoSettings(apiKey, promptText, draftPhotoSettings);
      setPromptText(rewrittenPrompt);
      setPromptEditorValue(rewrittenPrompt);
      setOverlay(null);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Prompt rewrite failed.');
    } finally {
      setIsRewritingPrompt(false);
    }
  }

  async function generateCurrentImage() {
    if (!apiKey) {
      setOverlay('apiKey');
      return;
    }

    if (!sourceImage || !promptText.trim()) {
      setStatusMessage('Capture or load an image before generating.');
      return;
    }

    setIsGenerating(true);
    try {
      const nextGeneratedImage = await renderImage(apiKey, promptText.trim(), selectedImageSize);
      const record: HistoryRecord = {
        id: createId('history'),
        sourceId: sourceId || createId('source'),
        createdAt: new Date().toISOString(),
        promptText: promptText.trim(),
        sourceImageDataUrl: sourceImage,
        generatedImageDataUrl: nextGeneratedImage,
        photoSettings,
        orientation: sourceOrientation,
        sourceWidth,
        sourceHeight,
      };

      await saveHistoryRecord(record);
      setGeneratedImage(nextGeneratedImage);
      setScreen('generated');
      void refreshHistory();
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Image generation failed.');
    } finally {
      setIsGenerating(false);
    }
  }

  function openHistoryRecord(record: HistoryRecord) {
    activeSourceIdRef.current = record.sourceId;
    setSourceId(record.sourceId);
    setSourceImage(record.sourceImageDataUrl);
    setGeneratedImage(record.generatedImageDataUrl);
    setPromptText(record.promptText);
    setPromptEditorValue(record.promptText);
    setPhotoSettings(record.photoSettings);
    setDraftPhotoSettings(record.photoSettings);
    setSourceOrientation(record.orientation);
    setSourceWidth(record.sourceWidth);
    setSourceHeight(record.sourceHeight);
    setScreen('generated');
    setOverlay(null);
  }

  async function shareCurrentImage(dataUrl: string, filePrefix: string) {
    if (!dataUrl) {
      return;
    }

    await shareImageDataUrl(dataUrl, `${filePrefix}-${Date.now()}.webp`);
  }

  function renderCameraScreen() {
    return (
      <section className={`screen screen-camera screen-${viewportOrientation}`}>
        <video ref={videoRef} className="camera-feed" playsInline muted autoPlay />
        <div className="screen-scrim" />
        <div className="screen-top">
          <IconButton icon="gallery" label="Load image from gallery" onClick={() => galleryInputRef.current?.click()} />
          <div className="top-stack">
            <IconButton icon="history" label="Open history" onClick={() => setScreen('history')} />
            <IconButton icon="settings" label="Open settings" onClick={() => setScreen('settings')} />
          </div>
        </div>
        <div className={`viewfinder-frame viewfinder-${viewportOrientation}`} />
        <div className="screen-center-hint">
          <p className="hint-title">{isCameraLive ? 'Ready to capture' : 'Camera viewfinder'}</p>
          <p className="hint-copy">{cameraError || cameraStatus}</p>
          {!isCameraLive ? <IconButton icon="retry" label="Retry camera" onClick={() => void startCamera()} /> : null}
        </div>
        <div className="screen-bottom">
          <button className="shutter-button" type="button" aria-label="Take photo" onClick={captureFrame} disabled={!isCameraLive}>
            <span />
          </button>
        </div>
      </section>
    );
  }

  function renderReviewScreen() {
    return (
      <section className="screen screen-review">
        <img className="fullscreen-image" src={sourceImage} alt="Captured source" />
        <div className="screen-scrim screen-scrim-image" />
        <div className="screen-top floating-actions">
          <IconButton icon="share" label="Share original image" onClick={() => void shareCurrentImage(sourceImage, 'promptograph-source')} />
          <IconButton icon="download" label="Download original image" onClick={() => downloadDataUrl(sourceImage, `promptograph-source-${Date.now()}.jpg`)} />
        </div>
        {promptText && !isAnalyzing ? <div className="prompt-panel">{promptText}</div> : null}
        {isBusy ? (
          <div className="busy-overlay">
            <div className="spinner" />
            <p>{isAnalyzing ? 'Generating prompt...' : isRewritingPrompt ? 'Rewriting prompt...' : 'Generating image...'}</p>
          </div>
        ) : null}
        <div className="screen-bottom action-cluster">
          <IconButton icon="edit" label="Edit prompt" onClick={openPromptEditor} disabled={!promptText || isBusy} />
          <IconButton icon="adjust" label="Edit photo settings" onClick={openPhotoSettingsEditor} disabled={!promptText || isBusy} />
          <IconButton icon="generate" label="Generate image" onClick={() => void generateCurrentImage()} variant="accent" disabled={!promptText || isBusy} />
          <IconButton icon="close" label="Cancel and return to camera" onClick={resetToCamera} disabled={isBusy} />
        </div>
      </section>
    );
  }

  function renderGeneratedScreen() {
    return (
      <section className="screen screen-generated">
        <img className="fullscreen-image" src={generatedImage} alt="Generated result" />
        <div className="screen-scrim screen-scrim-image" />
        <div className="screen-top floating-actions">
          <IconButton icon="share" label="Share generated image" onClick={() => void shareCurrentImage(generatedImage, 'promptograph-generated')} />
          <IconButton icon="download" label="Download generated image" onClick={() => downloadDataUrl(generatedImage, `promptograph-generated-${Date.now()}.webp`)} />
        </div>
        {isGenerating ? (
          <div className="busy-overlay">
            <div className="spinner" />
            <p>Generating image...</p>
          </div>
        ) : null}
        <div className="screen-bottom action-cluster">
          <IconButton icon="camera" label="Back to capture screen" onClick={resetToCamera} />
          <IconButton icon="back" label="Back to edit screen" onClick={() => setScreen('review')} />
        </div>
      </section>
    );
  }

  function renderHistoryScreen() {
    return (
      <section className="screen screen-panel">
        <header className="panel-top">
          <IconButton icon="back" label="Back to camera" onClick={() => setScreen('camera')} />
          <div>
            <p className="panel-kicker">Saved on device</p>
            <h2>History</h2>
          </div>
        </header>
        <div className="panel-content history-list">
          {history.length === 0 ? (
            <div className="empty-card">
              <p>No generations yet.</p>
            </div>
          ) : (
            history.map((record) => (
              <button key={record.id} className="history-card" type="button" onClick={() => openHistoryRecord(record)}>
                <div className="history-preview">
                  <img className="history-generated" src={record.generatedImageDataUrl} alt="" />
                  <img className="history-source" src={record.sourceImageDataUrl} alt="" />
                </div>
                <div className="history-meta">
                  <p>{formatTimestamp(record.createdAt)}</p>
                  <p>{record.photoSettings.mode}</p>
                </div>
                <p className="history-prompt">{record.promptText}</p>
              </button>
            ))
          )}
        </div>
      </section>
    );
  }

  function renderSettingsScreen() {
    return (
      <section className="screen screen-panel">
        <header className="panel-top">
          <IconButton icon="back" label="Back to camera" onClick={() => setScreen('camera')} />
          <div>
            <p className="panel-kicker">Local device settings</p>
            <h2>Settings</h2>
          </div>
        </header>
        <div className="panel-content settings-sheet">
          <label className="input-field">
            <span>OpenAI API key</span>
            <input
              type="password"
              value={apiKeyInput}
              onChange={(event) => setApiKeyInput(event.target.value)}
              placeholder="sk-..."
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <div className="floating-actions left-aligned">
            <IconButton icon="save" label="Save API key" onClick={saveApiKey} variant="accent" />
            <IconButton icon="trash" label="Forget API key" onClick={forgetApiKey} variant="danger" />
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className="app-shell dark-ui">
      <input ref={galleryInputRef} type="file" accept="image/*" hidden onChange={handleGalleryLoad} />

      {screen === 'camera' ? renderCameraScreen() : null}
      {screen === 'review' ? renderReviewScreen() : null}
      {screen === 'generated' ? renderGeneratedScreen() : null}
      {screen === 'history' ? renderHistoryScreen() : null}
      {screen === 'settings' ? renderSettingsScreen() : null}

      {overlay === 'apiKey' ? (
        <div className="overlay-screen">
          <div className="modal-card">
            <p className="panel-kicker">First run setup</p>
            <h2>Enter API key</h2>
            <p className="modal-copy">This key stays on this iPhone until you remove it in settings.</p>
            <label className="input-field">
              <span>OpenAI API key</span>
              <input
                type="password"
                value={apiKeyInput}
                onChange={(event) => setApiKeyInput(event.target.value)}
                placeholder="sk-..."
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            {keyDialogError ? <p className="error-message">{keyDialogError}</p> : null}
            <div className="floating-actions left-aligned">
              <IconButton icon="save" label="Save API key" onClick={saveApiKey} variant="accent" />
            </div>
          </div>
        </div>
      ) : null}

      {overlay === 'promptEdit' ? (
        <div className="overlay-screen">
          <div className="sheet-screen">
            <header className="panel-top">
              <IconButton icon="close" label="Close prompt editor" onClick={() => setOverlay(null)} />
              <div>
                <p className="panel-kicker">Prompt editor</p>
                <h2>Edit prompt</h2>
              </div>
              <IconButton icon="save" label="Save prompt" onClick={savePromptEdit} variant="accent" />
            </header>
            <div className="panel-content">
              <label className="input-field">
                <span>Prompt</span>
                <textarea rows={16} value={promptEditorValue} onChange={(event) => setPromptEditorValue(event.target.value)} />
              </label>
            </div>
          </div>
        </div>
      ) : null}

      {overlay === 'photoSettings' ? (
        <div className="overlay-screen">
          <div className="sheet-screen">
            <header className="panel-top">
              <IconButton icon="close" label="Close photo settings" onClick={() => setOverlay(null)} />
              <div>
                <p className="panel-kicker">Prompt rewrite</p>
                <h2>Photo settings</h2>
              </div>
              <IconButton icon="save" label="Apply photo settings" onClick={() => void applyPhotoSettings()} variant="accent" disabled={isRewritingPrompt} />
            </header>
            <div className="panel-content settings-grid">
              <label className="input-field">
                <span>Light</span>
                <select
                  value={draftPhotoSettings.light}
                  onChange={(event) => setDraftPhotoSettings((current) => ({ ...current, light: event.target.value as PhotoSettings['light'] }))}
                >
                  {LIGHT_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="input-field">
                <span>Focal length</span>
                <select
                  value={draftPhotoSettings.focalLength}
                  onChange={(event) =>
                    setDraftPhotoSettings((current) => ({ ...current, focalLength: event.target.value as PhotoSettings['focalLength'] }))
                  }
                >
                  {FOCAL_LENGTH_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="input-field">
                <span>Exposure</span>
                <select
                  value={draftPhotoSettings.exposure}
                  onChange={(event) =>
                    setDraftPhotoSettings((current) => ({ ...current, exposure: event.target.value as PhotoSettings['exposure'] }))
                  }
                >
                  {EXPOSURE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="input-field">
                <span>Mode</span>
                <select
                  value={draftPhotoSettings.mode}
                  onChange={(event) => setDraftPhotoSettings((current) => ({ ...current, mode: event.target.value as PhotoSettings['mode'] }))}
                >
                  {MODE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </div>
      ) : null}

      {statusMessage ? <div className="status-toast">{statusMessage}</div> : null}
    </div>
  );
}

export default App;
