import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { analyzePhoto, composeFullPrompt, renderImage } from './lib/openai';
import {
  loadRiskAcknowledgement,
  loadStoredApiKey,
  saveRiskAcknowledgement,
  saveStoredApiKey,
} from './lib/storage';
import type { ImageSize, PromptDraft } from './types';

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

const FIELD_META: Array<{ key: keyof PromptDraft; label: string; rows: number }> = [
  { key: 'subject', label: 'Subject', rows: 3 },
  { key: 'scene', label: 'Scene', rows: 3 },
  { key: 'composition', label: 'Composition', rows: 3 },
  { key: 'lighting', label: 'Lighting', rows: 3 },
  { key: 'colorPalette', label: 'Color palette', rows: 2 },
  { key: 'cameraDetails', label: 'Camera details', rows: 2 },
  { key: 'styleAndTexture', label: 'Style and texture', rows: 3 },
  { key: 'negativeConstraints', label: 'Negative constraints', rows: 3 },
];

function getImageSize(width: number, height: number): ImageSize {
  const ratio = width / height;
  if (ratio > 1.08) {
    return '1536x1024';
  }
  if (ratio < 0.92) {
    return '1024x1536';
  }
  return '1024x1024';
}

function App() {
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [riskAcknowledged, setRiskAcknowledged] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Enter your own OpenAI API key to enable analysis and rendering.');
  const [cameraStatus, setCameraStatus] = useState('Camera is idle.');
  const [cameraError, setCameraError] = useState('');
  const [capturedImage, setCapturedImage] = useState('');
  const [capturedDimensions, setCapturedDimensions] = useState({ width: 1024, height: 1536 });
  const [draft, setDraft] = useState<PromptDraft>(EMPTY_DRAFT);
  const [generatedImage, setGeneratedImage] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [manualPromptTouched, setManualPromptTouched] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const storedKey = loadStoredApiKey();
    const storedAck = loadRiskAcknowledgement();
    setApiKey(storedKey);
    setApiKeyInput(storedKey);
    setRiskAcknowledged(storedAck);
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const selectedSize = useMemo(
    () => getImageSize(capturedDimensions.width, capturedDimensions.height),
    [capturedDimensions.height, capturedDimensions.width],
  );

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  async function startCamera() {
    setCameraError('');
    setCameraStatus('Requesting rear camera...');

    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1536 },
          height: { ideal: 2048 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setCameraStatus('Rear camera is live.');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Could not access the camera on this device/browser.';
      setCameraError(message);
      setCameraStatus('Camera access failed.');
    }
  }

  function captureFrame() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setCameraError('Camera preview is not ready yet.');
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');

    if (!context) {
      setCameraError('Could not read a frame from the camera.');
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageDataUrl = canvas.toDataURL('image/jpeg', 0.92);

    setCapturedImage(imageDataUrl);
    setCapturedDimensions({ width: canvas.width, height: canvas.height });
    setGeneratedImage('');
    setDraft(EMPTY_DRAFT);
    setManualPromptTouched(false);
    setStatusMessage('Photo captured. Analyze it to generate a reconstruction prompt.');
  }

  function handleFileFallback(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result) {
        setCameraError('Could not read the selected image.');
        return;
      }

      const image = new Image();
      image.onload = () => {
        setCapturedImage(result);
        setCapturedDimensions({ width: image.width, height: image.height });
        setGeneratedImage('');
        setDraft(EMPTY_DRAFT);
        setManualPromptTouched(false);
        setStatusMessage('Fallback image loaded. Analyze it to generate a reconstruction prompt.');
      };
      image.src = result;
    };
    reader.readAsDataURL(file);
  }

  function saveApiKey() {
    const trimmed = apiKeyInput.trim();
    setApiKey(trimmed);
    saveStoredApiKey(trimmed);
    saveRiskAcknowledgement(riskAcknowledged);
    setStatusMessage(trimmed ? 'API key saved on this device.' : 'API key cleared from this device.');
  }

  function clearApiKey() {
    setApiKey('');
    setApiKeyInput('');
    saveStoredApiKey('');
    setStatusMessage('API key cleared from this device.');
  }

  async function analyzeCapturedImage() {
    if (!apiKey) {
      setStatusMessage('Enter an API key before calling OpenAI.');
      return;
    }

    if (!capturedImage) {
      setStatusMessage('Capture a photo first.');
      return;
    }

    setIsAnalyzing(true);
    setGeneratedImage('');
    setStatusMessage('Analyzing the captured image...');

    try {
      const nextDraft = await analyzePhoto(apiKey, capturedImage);
      setDraft(nextDraft);
      setManualPromptTouched(false);
      setStatusMessage('Prompt draft created. Adjust the fields or edit the final prompt directly.');
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Image analysis failed.');
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function renderFromPrompt() {
    if (!apiKey) {
      setStatusMessage('Enter an API key before rendering.');
      return;
    }

    const prompt = draft.fullPrompt.trim() || composeFullPrompt(draft);
    if (!prompt) {
      setStatusMessage('Analyze a photo or write a prompt first.');
      return;
    }

    setIsRendering(true);
    setStatusMessage('Rendering with GPT Image 1.5...');

    try {
      const imageDataUrl = await renderImage(apiKey, prompt, selectedSize);
      setGeneratedImage(imageDataUrl);
      setStatusMessage('Rendered image ready.');
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Image rendering failed.');
    } finally {
      setIsRendering(false);
    }
  }

  function updateDraftField(key: keyof PromptDraft, value: string) {
    setDraft((currentDraft) => {
      const nextDraft = {
        ...currentDraft,
        [key]: value,
      };

      if (key !== 'fullPrompt' && !manualPromptTouched) {
        nextDraft.fullPrompt = composeFullPrompt(nextDraft);
      }

      return nextDraft;
    });

    if (key === 'fullPrompt') {
      setManualPromptTouched(true);
    }
  }

  function resetPromptComposition() {
    setDraft((currentDraft) => {
      const nextPrompt = composeFullPrompt(currentDraft);
      return {
        ...currentDraft,
        fullPrompt: nextPrompt,
      };
    });
    setManualPromptTouched(false);
    setStatusMessage('Full prompt rebuilt from the structured fields.');
  }

  const hasApiKey = Boolean(apiKey);

  return (
    <div className="app-shell">
      <div className="backdrop backdrop-a" />
      <div className="backdrop backdrop-b" />
      <main className="layout">
        <section className="hero card">
          <p className="eyebrow">Static iPhone camera PWA</p>
          <h1>Promptograph</h1>
          <p className="lede">
            Capture a photo, convert it into a recreation-ready prompt, refine the prompt, then render a new image
            with GPT Image 1.5.
          </p>
          <div className="pill-row">
            <span className={`pill ${hasApiKey ? 'pill-ok' : ''}`}>{hasApiKey ? 'Key saved locally' : 'Key missing'}</span>
            <span className="pill">Output {selectedSize}</span>
            <span className="pill">GitHub Pages ready</span>
          </div>
        </section>

        <section className="settings card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">OpenAI access</p>
              <h2>On-device API key</h2>
            </div>
          </div>
          <label className="field">
            <span>Your OpenAI API key</span>
            <input
              type="password"
              placeholder="sk-..."
              value={apiKeyInput}
              onChange={(event) => setApiKeyInput(event.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={riskAcknowledged}
              onChange={(event) => {
                const checked = event.target.checked;
                setRiskAcknowledged(checked);
                saveRiskAcknowledgement(checked);
              }}
            />
            <span>I understand this key is stored locally in the browser on this device.</span>
          </label>
          <div className="action-row">
            <button className="button button-primary" onClick={saveApiKey} disabled={!riskAcknowledged}>
              Save key
            </button>
            <button className="button button-secondary" onClick={clearApiKey}>
              Clear key
            </button>
          </div>
          <p className="status-text">{statusMessage}</p>
        </section>

        <section className="camera-grid">
          <div className="camera-panel card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Capture</p>
                <h2>Rear camera</h2>
              </div>
              <div className="action-row compact">
                <button className="button button-secondary" onClick={startCamera}>
                  Enable camera
                </button>
                <button className="button button-primary" onClick={captureFrame}>
                  Take photo
                </button>
              </div>
            </div>
            <div className="preview-frame">
              <video ref={videoRef} playsInline muted autoPlay />
            </div>
            <p className="status-text">{cameraStatus}</p>
            {cameraError ? <p className="error-text">{cameraError}</p> : null}
            <div className="fallback-row">
              <button className="button button-ghost" onClick={() => fileInputRef.current?.click()}>
                Use fallback image
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleFileFallback} />
            </div>
          </div>

          <div className="capture-panel card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Source frame</p>
                <h2>Captured image</h2>
              </div>
              <div className="action-row compact">
                <button className="button button-primary" onClick={analyzeCapturedImage} disabled={isAnalyzing || !capturedImage}>
                  {isAnalyzing ? 'Analyzing...' : 'Analyze photo'}
                </button>
              </div>
            </div>
            <div className="image-frame still-frame">
              {capturedImage ? <img src={capturedImage} alt="Captured source" /> : <p>No captured image yet.</p>}
            </div>
          </div>
        </section>

        <section className="editor-grid">
          <div className="card editor-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Prompt draft</p>
                <h2>Structured editor</h2>
              </div>
              <button className="button button-secondary" onClick={resetPromptComposition}>
                Rebuild final prompt
              </button>
            </div>
            <div className="editor-fields">
              {FIELD_META.map((field) => (
                <label key={field.key} className="field">
                  <span>{field.label}</span>
                  <textarea
                    rows={field.rows}
                    value={draft[field.key]}
                    onChange={(event) => updateDraftField(field.key, event.target.value)}
                    placeholder={`Describe ${field.label.toLowerCase()}...`}
                  />
                </label>
              ))}
            </div>
            <label className="field full-prompt-field">
              <span>Full prompt</span>
              <textarea
                rows={8}
                value={draft.fullPrompt}
                onChange={(event) => updateDraftField('fullPrompt', event.target.value)}
                placeholder="Your polished generation prompt will appear here."
              />
            </label>
          </div>

          <div className="card render-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Render</p>
                <h2>GPT Image 1.5 output</h2>
              </div>
              <button className="button button-primary" onClick={renderFromPrompt} disabled={isRendering}>
                {isRendering ? 'Rendering...' : 'Render image'}
              </button>
            </div>
            <p className="render-meta">Default size: {selectedSize}</p>
            <div className="image-frame">
              {generatedImage ? <img src={generatedImage} alt="Rendered result" /> : <p>Rendered output will appear here.</p>}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
