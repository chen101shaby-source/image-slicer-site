import { useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import {
  Download,
  Grid2x2Plus,
  Image as ImageIcon,
  Move,
  Plus,
  Scissors,
  Trash2,
} from "lucide-react";

type DraggingGuide = { type: "v" | "h"; index: number } | null;
type SelectedGuide = { type: "v" | "h"; index: number } | null;
type Mode = "guides" | "freehand" | "rectangle";

type Slice = {
  x: number;
  y: number;
  width: number;
  height: number;
  row: number;
  col: number;
};

type Point = {
  x: number;
  y: number;
};

type FreehandRegion = {
  key: string;
  points: Point[];
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

type RectRegion = {
  key: string;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

type OutputPiece = {
  key: string;
  label: string;
  width: number;
  height: number;
  dataUrl: string;
};

type SavedPiece = OutputPiece & {
  savedAt: number;
};

const RECTANGLE_SIZE_PRESETS = [
  { width: 800, height: 800, label: "800 x 800", description: "Good for fast-loading square product images." },
  { width: 1080, height: 1080, label: "1080 x 1080", description: "Great for digital catalogs and social-ready square images." },
  { width: 1200, height: 1200, label: "1200 x 1200", description: "Best balanced choice for high-quality e-commerce product photos." },
  { width: 1200, height: 1600, label: "1200 x 1600", description: "Better for tall products and portrait-style product cards." },
] as const;

type CleanupTool = "paint" | "complete";
type CleanupSelection = {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
} | null;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function sortUnique(values: number[], min: number, max: number) {
  return [...new Set(values.map((value) => Math.round(clamp(value, min, max))))].sort((a, b) => a - b);
}

function dataUrlToBlob(dataUrl: string) {
  const parts = dataUrl.split(",");
  const mime = parts[0].match(/:(.*?);/)?.[1] ?? "image/png";
  const bstr = atob(parts[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);

  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }

  return new Blob([u8arr], { type: mime });
}

function buildImage(file: File) {
  return new Promise<{ image: HTMLImageElement; src: string }>((resolve, reject) => {
    const src = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => resolve({ image, src });
    image.onerror = () => {
      URL.revokeObjectURL(src);
      reject(new Error("Failed to load image."));
    };
    image.src = src;
  });
}

function buildImageFromSrc(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load image."));
    image.src = src;
  });
}

function getDefaultGuides(size: number, parts: number) {
  return Array.from({ length: parts - 1 }, (_, index) => Math.round((size * (index + 1)) / parts));
}

function createSliceDataUrl(image: HTMLImageElement, slice: Slice) {
  const canvas = document.createElement("canvas");
  canvas.width = slice.width;
  canvas.height = slice.height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas is not supported in this browser.");
  }

  context.drawImage(
    image,
    slice.x,
    slice.y,
    slice.width,
    slice.height,
    0,
    0,
    slice.width,
    slice.height
  );

  return canvas.toDataURL("image/png");
}

function pointInPolygon(x: number, y: number, points: Point[]) {
  let inside = false;

  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const xi = points[i].x;
    const yi = points[i].y;
    const xj = points[j].x;
    const yj = points[j].y;

    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-9) + xi;
    if (intersect) {
      inside = !inside;
    }
  }

  return inside;
}

function getRegionBounds(points: Point[]) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);

  return {
    x: Math.floor(Math.min(...xs)),
    y: Math.floor(Math.min(...ys)),
    width: Math.max(1, Math.ceil(Math.max(...xs)) - Math.floor(Math.min(...xs))),
    height: Math.max(1, Math.ceil(Math.max(...ys)) - Math.floor(Math.min(...ys))),
  };
}

function createFreehandDataUrl(image: HTMLImageElement, region: FreehandRegion) {
  const canvas = document.createElement("canvas");
  canvas.width = region.bounds.width;
  canvas.height = region.bounds.height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas is not supported in this browser.");
  }

  const sampleCanvas = document.createElement("canvas");
  sampleCanvas.width = region.bounds.width;
  sampleCanvas.height = region.bounds.height;
  const sampleContext = sampleCanvas.getContext("2d", { willReadFrequently: true });

  if (!sampleContext) {
    throw new Error("Canvas is not supported in this browser.");
  }

  sampleContext.drawImage(
    image,
    region.bounds.x,
    region.bounds.y,
    region.bounds.width,
    region.bounds.height,
    0,
    0,
    region.bounds.width,
    region.bounds.height
  );

  const relativePoints = region.points.map((point) => ({
    x: point.x - region.bounds.x,
    y: point.y - region.bounds.y,
  }));

  const imageData = sampleContext.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height);
  const { data, width, height } = imageData;
  let redTotal = 0;
  let greenTotal = 0;
  let blueTotal = 0;
  let alphaTotal = 0;
  let samples = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pointInPolygon(x + 0.5, y + 0.5, relativePoints)) {
        continue;
      }

      const offset = (y * width + x) * 4;
      const alpha = data[offset + 3];
      if (alpha === 0) {
        continue;
      }

      redTotal += data[offset];
      greenTotal += data[offset + 1];
      blueTotal += data[offset + 2];
      alphaTotal += alpha;
      samples += 1;
    }
  }

  const fallbackFill = "rgb(245, 248, 252)";
  if (samples > 0) {
    const red = Math.round(redTotal / samples);
    const green = Math.round(greenTotal / samples);
    const blue = Math.round(blueTotal / samples);
    const alpha = Math.max(0.55, Math.min(1, alphaTotal / samples / 255));
    context.fillStyle = `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  } else {
    context.fillStyle = fallbackFill;
  }

  context.fillRect(0, 0, canvas.width, canvas.height);

  context.save();
  context.beginPath();

  relativePoints.forEach((point, index) => {
    const x = point.x;
    const y = point.y;

    if (index === 0) {
      context.moveTo(x, y);
      return;
    }

    context.lineTo(x, y);
  });

  context.closePath();
  context.clip();
  context.drawImage(
    sampleCanvas,
    0,
    0,
    region.bounds.width,
    region.bounds.height
  );
  context.restore();

  return canvas.toDataURL("image/png");
}

function createRegionPath(points: Point[]) {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
}

function sampleImageDataEdgeColor(imageData: ImageData) {
  const { data, width, height } = imageData;
  let red = 0;
  let green = 0;
  let blue = 0;
  let count = 0;

  for (let x = 0; x < width; x += 1) {
    const top = x * 4;
    const bottom = ((height - 1) * width + x) * 4;
    red += data[top] + data[bottom];
    green += data[top + 1] + data[bottom + 1];
    blue += data[top + 2] + data[bottom + 2];
    count += 2;
  }

  for (let y = 1; y < height - 1; y += 1) {
    const left = y * width * 4;
    const right = (y * width + (width - 1)) * 4;
    red += data[left] + data[right];
    green += data[left + 1] + data[right + 1];
    blue += data[left + 2] + data[right + 2];
    count += 2;
  }

  if (count === 0) {
    return "#ffffff";
  }

  const toHex = (value: number) => value.toString(16).padStart(2, "0");
  return `#${toHex(Math.round(red / count))}${toHex(Math.round(green / count))}${toHex(Math.round(blue / count))}`;
}

function trimRectToSubject(image: HTMLImageElement, bounds: RectRegion["bounds"]) {
  const canvas = document.createElement("canvas");
  canvas.width = bounds.width;
  canvas.height = bounds.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    return bounds;
  }

  context.drawImage(image, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, bounds.width, bounds.height);
  const { data, width, height } = context.getImageData(0, 0, bounds.width, bounds.height);
  const fillHex = sampleEdgeColor(canvas as unknown as HTMLImageElement);
  const fillColor = hexToRgb(fillHex);
  const tolerance = 36;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const alpha = data[offset + 3];
      if (alpha === 0) {
        continue;
      }

      const delta = colorDistance(data[offset], data[offset + 1], data[offset + 2], fillColor);
      if (delta <= tolerance) {
        continue;
      }

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) {
    return bounds;
  }

  return {
    x: bounds.x + minX,
    y: bounds.y + minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

function createRectDataUrl(
  image: HTMLImageElement,
  region: RectRegion,
  options?: { targetWidth?: number; targetHeight?: number; objectCoverage?: number }
) {
  const trimmedBounds = trimRectToSubject(image, region.bounds);
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = trimmedBounds.width;
  sourceCanvas.height = trimmedBounds.height;
  const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });

  if (!sourceContext) {
    throw new Error("Canvas is not supported in this browser.");
  }

  sourceContext.drawImage(
    image,
    trimmedBounds.x,
    trimmedBounds.y,
    trimmedBounds.width,
    trimmedBounds.height,
    0,
    0,
    trimmedBounds.width,
    trimmedBounds.height
  );

  const sourceImageData = sourceContext.getImageData(0, 0, trimmedBounds.width, trimmedBounds.height);
  const backgroundColor = sampleImageDataEdgeColor(sourceImageData);

  const targetWidth = options?.targetWidth ?? trimmedBounds.width;
  const targetHeight = options?.targetHeight ?? trimmedBounds.height;
  const coverage = options?.objectCoverage ?? 0.78;

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas is not supported in this browser.");
  }

  const maxObjectWidth = targetWidth * coverage;
  const maxObjectHeight = targetHeight * coverage;
  const fitScale = Math.min(maxObjectWidth / trimmedBounds.width, maxObjectHeight / trimmedBounds.height);
  const drawWidth = Math.max(1, Math.round(trimmedBounds.width * fitScale));
  const drawHeight = Math.max(1, Math.round(trimmedBounds.height * fitScale));
  const drawX = Math.round((targetWidth - drawWidth) / 2);
  const drawY = Math.round((targetHeight - drawHeight) / 2);

  context.fillStyle = backgroundColor;
  context.fillRect(0, 0, targetWidth, targetHeight);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(sourceCanvas, 0, 0, trimmedBounds.width, trimmedBounds.height, drawX, drawY, drawWidth, drawHeight);

  return {
    dataUrl: canvas.toDataURL("image/png"),
    width: targetWidth,
    height: targetHeight,
  };
}

function colorDistance(r: number, g: number, b: number, target: { r: number; g: number; b: number }) {
  return Math.abs(r - target.r) + Math.abs(g - target.g) + Math.abs(b - target.b);
}

function findNearestSubjectPixel(
  sourceData: Uint8ClampedArray,
  width: number,
  height: number,
  startX: number,
  startY: number,
  fillColor: { r: number; g: number; b: number }
) {
  const maxRadius = Math.max(width, height);
  const tolerance = 36;
  let bestOffset = -1;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let radius = 1; radius <= maxRadius; radius += 1) {
    const minX = Math.max(0, startX - radius);
    const maxX = Math.min(width - 1, startX + radius);
    const minY = Math.max(0, startY - radius);
    const maxY = Math.min(height - 1, startY + radius);

    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        if (x !== minX && x !== maxX && y !== minY && y !== maxY) {
          continue;
        }

        const offset = (y * width + x) * 4;
        const alpha = sourceData[offset + 3];
        if (alpha === 0) {
          continue;
        }

        const distanceFromFill = colorDistance(
          sourceData[offset],
          sourceData[offset + 1],
          sourceData[offset + 2],
          fillColor
        );

        if (distanceFromFill <= tolerance) {
          continue;
        }

        const dx = x - startX;
        const dy = y - startY;
        const distance = dx * dx + dy * dy;
        const brightness = sourceData[offset] + sourceData[offset + 1] + sourceData[offset + 2];
        const score = distance - brightness * 0.02;

        if (score < bestScore) {
          bestScore = score;
          bestOffset = offset;
        }
      }
    }

    if (bestOffset !== -1) {
      return bestOffset;
    }
  }

  return -1;
}

function sampleEdgeColor(image: HTMLImageElement) {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    return "#f5f8fc";
  }

  context.drawImage(image, 0, 0);
  const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
  let red = 0;
  let green = 0;
  let blue = 0;
  let count = 0;

  for (let x = 0; x < width; x += 1) {
    const top = x * 4;
    const bottom = ((height - 1) * width + x) * 4;
    red += data[top] + data[bottom];
    green += data[top + 1] + data[bottom + 1];
    blue += data[top + 2] + data[bottom + 2];
    count += 2;
  }

  for (let y = 1; y < height - 1; y += 1) {
    const left = (y * width) * 4;
    const right = (y * width + (width - 1)) * 4;
    red += data[left] + data[right];
    green += data[left + 1] + data[right + 1];
    blue += data[left + 2] + data[right + 2];
    count += 2;
  }

  if (count === 0) {
    return "#f5f8fc";
  }

  const toHex = (value: number) => value.toString(16).padStart(2, "0");
  return `#${toHex(Math.round(red / count))}${toHex(Math.round(green / count))}${toHex(Math.round(blue / count))}`;
}

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  const safe = normalized.length === 3
    ? normalized.split("").map((char) => `${char}${char}`).join("")
    : normalized;

  return {
    r: parseInt(safe.slice(0, 2), 16),
    g: parseInt(safe.slice(2, 4), 16),
    b: parseInt(safe.slice(4, 6), 16),
  };
}

export default function App() {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imageEl, setImageEl] = useState<HTMLImageElement | null>(null);
  const [verticalGuides, setVerticalGuides] = useState<number[]>([]);
  const [horizontalGuides, setHorizontalGuides] = useState<number[]>([]);
  const [committedVerticalGuides, setCommittedVerticalGuides] = useState<number[]>([]);
  const [committedHorizontalGuides, setCommittedHorizontalGuides] = useState<number[]>([]);
  const [dragging, setDragging] = useState<DraggingGuide>(null);
  const [selectedGuide, setSelectedGuide] = useState<SelectedGuide>(null);
  const [scale, setScale] = useState(100);
  const [fileName, setFileName] = useState("image");
  const [isExportingZip, setIsExportingZip] = useState(false);
  const [isEditingGuides, setIsEditingGuides] = useState(false);
  const [removedPieceKeys, setRemovedPieceKeys] = useState<string[]>([]);
  const [editedPieceDataUrls, setEditedPieceDataUrls] = useState<Record<string, string>>({});
  const [pieceNames, setPieceNames] = useState<Record<string, string>>({});
  const [exportScale, setExportScale] = useState(1);
  const [rectangleTargetWidth, setRectangleTargetWidth] = useState(1200);
  const [rectangleTargetHeight, setRectangleTargetHeight] = useState(1200);
  const [mode, setMode] = useState<Mode>("guides");
  const [freehandRegions, setFreehandRegions] = useState<FreehandRegion[]>([]);
  const [rectRegions, setRectRegions] = useState<RectRegion[]>([]);
  const [draftFreehandPoints, setDraftFreehandPoints] = useState<Point[]>([]);
  const [isDrawingFreehand, setIsDrawingFreehand] = useState(false);
  const [draftRectSelection, setDraftRectSelection] = useState<{
    startX: number;
    startY: number;
    endX: number;
    endY: number;
  } | null>(null);
  const [savedPieces, setSavedPieces] = useState<SavedPiece[]>([]);
  const [cleanupPieceKey, setCleanupPieceKey] = useState<string | null>(null);
  const [cleanupFillColor, setCleanupFillColor] = useState("#ffffff");
  const [cleanupBrushSize, setCleanupBrushSize] = useState(28);
  const [isCleanupPainting, setIsCleanupPainting] = useState(false);
  const [cleanupHistory, setCleanupHistory] = useState<string[]>([]);
  const [cleanupTool, setCleanupTool] = useState<CleanupTool>("paint");
  const [cleanupOriginalDataUrl, setCleanupOriginalDataUrl] = useState<string | null>(null);
  const [cleanupSelection, setCleanupSelection] = useState<CleanupSelection>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const cleanupCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cleanupLastPointRef = useRef<Point | null>(null);
  const cleanupOriginalCanvasRef = useRef<HTMLCanvasElement | null>(null);

  function applyRectanglePreset(width: number, height: number) {
    setRectangleTargetWidth(width);
    setRectangleTargetHeight(height);
  }

  const getPieceName = (piece: OutputPiece, index: number) => {
    const customName = pieceNames[piece.key]?.trim();
    return customName || `${fileName}-${index + 1}`;
  };

  const upscaleDataUrl = async (dataUrl: string, scaleFactor: number) => {
    if (scaleFactor === 1) {
      return dataUrl;
    }

    const image = await buildImageFromSrc(dataUrl);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scaleFactor));
    canvas.height = Math.max(1, Math.round(image.height * scaleFactor));
    const context = canvas.getContext("2d");

    if (!context) {
      return dataUrl;
    }

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  };

  useEffect(() => {
    return () => {
      if (imageSrc?.startsWith("blob:")) {
        URL.revokeObjectURL(imageSrc);
      }
    };
  }, [imageSrc]);

  useEffect(() => {
    function onMove(event: MouseEvent) {
      if (!imageEl || !previewRef.current) {
        return;
      }

      const rect = previewRef.current.getBoundingClientRect();

      if (mode === "freehand" && isDrawingFreehand) {
        const x = clamp(event.clientX - rect.left, 0, rect.width);
        const y = clamp(event.clientY - rect.top, 0, rect.height);
        const point = {
          x: Math.round((x / rect.width) * imageEl.width),
          y: Math.round((y / rect.height) * imageEl.height),
        };

        setDraftFreehandPoints((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.x === point.x && last.y === point.y) {
            return prev;
          }

          return [...prev, point];
        });

        return;
      }

      if (mode === "rectangle" && draftRectSelection) {
        const x = clamp(event.clientX - rect.left, 0, rect.width);
        const y = clamp(event.clientY - rect.top, 0, rect.height);

        setDraftRectSelection((prev) =>
          prev
            ? {
                ...prev,
                endX: Math.round((x / rect.width) * imageEl.width),
                endY: Math.round((y / rect.height) * imageEl.height),
              }
            : prev
        );
        return;
      }

      if (!dragging || mode !== "guides") {
        return;
      }

      const renderedWidth = rect.width;
      const renderedHeight = rect.height;

      if (dragging.type === "v") {
        const x = clamp(event.clientX - rect.left, 0, renderedWidth);
        const px = Math.round((x / renderedWidth) * imageEl.width);

        setVerticalGuides((prev) => {
          const next = [...prev];
          next[dragging.index] = px;
          return sortUnique(next, 1, imageEl.width - 1);
        });
      } else {
        const y = clamp(event.clientY - rect.top, 0, renderedHeight);
        const px = Math.round((y / renderedHeight) * imageEl.height);

        setHorizontalGuides((prev) => {
          const next = [...prev];
          next[dragging.index] = px;
          return sortUnique(next, 1, imageEl.height - 1);
        });
      }
    }

    function onUp() {
      if (mode === "freehand" && isDrawingFreehand) {
        setIsDrawingFreehand(false);

        if (draftFreehandPoints.length >= 3) {
          const points = [...draftFreehandPoints];
          const region: FreehandRegion = {
            key: `freehand-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            points,
            bounds: getRegionBounds(points),
          };

          setEditedPieceDataUrls({});
          setFreehandRegions((prev) => [...prev, region]);
        }

        setDraftFreehandPoints([]);
        return;
      }

      if (mode === "rectangle" && draftRectSelection) {
        const minX = Math.min(draftRectSelection.startX, draftRectSelection.endX);
        const minY = Math.min(draftRectSelection.startY, draftRectSelection.endY);
        const width = Math.abs(draftRectSelection.endX - draftRectSelection.startX);
        const height = Math.abs(draftRectSelection.endY - draftRectSelection.startY);

        if (width > 4 && height > 4) {
          setEditedPieceDataUrls({});
          setRectRegions((prev) => [
            ...prev,
            {
              key: `rect-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              bounds: {
                x: minX,
                y: minY,
                width,
                height,
              },
            },
          ]);
        }

        setDraftRectSelection(null);
        return;
      }

      setDragging(null);
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [draftFreehandPoints, draftRectSelection, dragging, imageEl, isDrawingFreehand, mode]);

  useEffect(() => {
    if (!imageEl) {
      setCommittedVerticalGuides([]);
      setCommittedHorizontalGuides([]);
      setIsEditingGuides(false);
      return;
    }

    setIsEditingGuides(true);

    const timeoutId = window.setTimeout(() => {
      setCommittedVerticalGuides(sortUnique(verticalGuides, 1, imageEl.width - 1));
      setCommittedHorizontalGuides(sortUnique(horizontalGuides, 1, imageEl.height - 1));
      setIsEditingGuides(false);
    }, dragging ? 220 : 500);

    return () => window.clearTimeout(timeoutId);
  }, [dragging, horizontalGuides, imageEl, verticalGuides]);

  const gridSlices = useMemo(() => {
    if (!imageEl) {
      return [] as Slice[];
    }

    if (committedVerticalGuides.length === 0 && committedHorizontalGuides.length === 0) {
      return [] as Slice[];
    }

    const xs = [0, ...sortUnique(committedVerticalGuides, 1, imageEl.width - 1), imageEl.width];
    const ys = [0, ...sortUnique(committedHorizontalGuides, 1, imageEl.height - 1), imageEl.height];
    const next: Slice[] = [];

    for (let row = 0; row < ys.length - 1; row += 1) {
      for (let col = 0; col < xs.length - 1; col += 1) {
        next.push({
          x: xs[col],
          y: ys[row],
          width: xs[col + 1] - xs[col],
          height: ys[row + 1] - ys[row],
          row,
          col,
        });
      }
    }

    return next;
  }, [committedHorizontalGuides, committedVerticalGuides, imageEl]);

  const baseOutputPieces = useMemo(() => {
    if (!imageEl) {
      return [] as OutputPiece[];
    }

    const gridPieces = gridSlices
      .filter((slice) => !removedPieceKeys.includes(`grid-${slice.row}-${slice.col}`))
      .map((slice, index) => {
        const key = `grid-${slice.row}-${slice.col}`;
        const dataUrl = createSliceDataUrl(imageEl, slice);

        return {
          key,
          label: `Piece ${index + 1}`,
        width: slice.width,
        height: slice.height,
        dataUrl,
      };
      });

    const freehandPieces = freehandRegions
      .filter((region) => !removedPieceKeys.includes(region.key))
      .map((region, index) => {
        return {
          key: region.key,
        label: `Freehand ${index + 1}`,
        width: region.bounds.width,
          height: region.bounds.height,
          dataUrl: createFreehandDataUrl(imageEl, region),
        };
      });

    const rectPieces = rectRegions
      .filter((region) => !removedPieceKeys.includes(region.key))
      .map((region, index) => {
        const rectPiece = createRectDataUrl(imageEl, region, {
          targetWidth: rectangleTargetWidth,
          targetHeight: rectangleTargetHeight,
          objectCoverage: 0.76,
        });

        return {
          key: region.key,
          label: `Rectangle ${index + 1}`,
          width: rectPiece.width,
          height: rectPiece.height,
          dataUrl: rectPiece.dataUrl,
        };
      });

    return [...gridPieces, ...freehandPieces, ...rectPieces];
  }, [freehandRegions, gridSlices, imageEl, rectRegions, rectangleTargetHeight, rectangleTargetWidth, removedPieceKeys]);

  const outputPieces = useMemo(
    () =>
      baseOutputPieces.map((piece) => ({
        ...piece,
        dataUrl: editedPieceDataUrls[piece.key] ?? piece.dataUrl,
      })),
    [baseOutputPieces, editedPieceDataUrls]
  );

  const cleanupPiece = useMemo(
    () => outputPieces.find((piece) => piece.key === cleanupPieceKey) ?? null,
    [cleanupPieceKey, outputPieces]
  );

  useEffect(() => {
    async function loadCleanupPiece() {
      if (!cleanupPiece || !cleanupCanvasRef.current) {
        return;
      }

      const image = await buildImageFromSrc(cleanupPiece.dataUrl);
      const canvas = cleanupCanvasRef.current;
      if (!canvas) {
        return;
      }

      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      if (!context) {
        return;
      }

      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0);
      setCleanupFillColor("#ffffff");
      setCleanupHistory([]);
      setCleanupTool("paint");
      setCleanupSelection(null);
      cleanupLastPointRef.current = null;
    }

    void loadCleanupPiece();
  }, [cleanupPiece]);

  useEffect(() => {
    const basePiece = baseOutputPieces.find((piece) => piece.key === cleanupPieceKey) ?? null;
    setCleanupOriginalDataUrl(basePiece?.dataUrl ?? null);
  }, [baseOutputPieces, cleanupPieceKey]);

  useEffect(() => {
    async function loadCleanupOriginalPiece() {
      if (!cleanupOriginalDataUrl || !cleanupPiece) {
        cleanupOriginalCanvasRef.current = null;
        return;
      }

      const image = await buildImageFromSrc(cleanupOriginalDataUrl);
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d", { willReadFrequently: true });

      if (!context) {
        cleanupOriginalCanvasRef.current = null;
        return;
      }

      context.drawImage(image, 0, 0);
      cleanupOriginalCanvasRef.current = canvas;
    }

    void loadCleanupOriginalPiece();
  }, [cleanupOriginalDataUrl, cleanupPiece]);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
    const { image, src } = await buildImage(file);

    if (imageSrc?.startsWith("blob:")) {
      URL.revokeObjectURL(imageSrc);
    }

    setImageSrc(src);
    setImageEl(image);
    setFileName(baseName);
    setVerticalGuides(getDefaultGuides(image.width, 3));
    setHorizontalGuides([]);
    setCommittedVerticalGuides([]);
    setCommittedHorizontalGuides([]);
    setIsEditingGuides(true);
    setEditedPieceDataUrls({});
    setRemovedPieceKeys([]);
    setPieceNames({});
    setFreehandRegions([]);
    setRectRegions([]);
    setSavedPieces([]);
    setDraftFreehandPoints([]);
    setDraftRectSelection(null);
    setSelectedGuide(null);
    setMode("guides");
  }

  function addGuide(type: "v" | "h") {
    if (!imageEl) {
      return;
    }

    if (type === "v") {
      setIsEditingGuides(true);
      setEditedPieceDataUrls({});
      setVerticalGuides((prev) => sortUnique([...prev, Math.round(imageEl.width / 2)], 1, imageEl.width - 1));
    } else {
      setIsEditingGuides(true);
      setEditedPieceDataUrls({});
      setHorizontalGuides((prev) =>
        sortUnique([...prev, Math.round(imageEl.height / 2)], 1, imageEl.height - 1)
      );
    }
  }

  function removeLastGuide(type: "v" | "h") {
    if (type === "v") {
      if (verticalGuides.length === 0) {
        return;
      }

      setIsEditingGuides(true);
      setEditedPieceDataUrls({});
      setVerticalGuides((prev) => prev.slice(0, -1));

      if (selectedGuide?.type === "v") {
        setSelectedGuide(null);
      }

      return;
    }

    if (horizontalGuides.length === 0) {
      return;
    }

    setIsEditingGuides(true);
    setEditedPieceDataUrls({});
    setHorizontalGuides((prev) => prev.slice(0, -1));

    if (selectedGuide?.type === "h") {
      setSelectedGuide(null);
    }
  }

  function deleteSelectedGuide() {
    if (!selectedGuide) {
      return;
    }

    if (selectedGuide.type === "v") {
      setIsEditingGuides(true);
      setEditedPieceDataUrls({});
      setVerticalGuides((prev) => prev.filter((_, index) => index !== selectedGuide.index));
    } else {
      setIsEditingGuides(true);
      setEditedPieceDataUrls({});
      setHorizontalGuides((prev) => prev.filter((_, index) => index !== selectedGuide.index));
    }

    setSelectedGuide(null);
  }

  function clearWorkspace() {
    if (imageSrc?.startsWith("blob:")) {
      URL.revokeObjectURL(imageSrc);
    }

    setImageSrc(null);
    setImageEl(null);
    setVerticalGuides([]);
    setHorizontalGuides([]);
    setCommittedVerticalGuides([]);
    setCommittedHorizontalGuides([]);
    setDragging(null);
    setSelectedGuide(null);
    setScale(100);
    setFileName("image");
    setIsExportingZip(false);
    setIsEditingGuides(false);
    setEditedPieceDataUrls({});
    setRemovedPieceKeys([]);
    setPieceNames({});
    setFreehandRegions([]);
    setRectRegions([]);
    setSavedPieces([]);
    setDraftFreehandPoints([]);
    setDraftRectSelection(null);
    setIsDrawingFreehand(false);
    setCleanupPieceKey(null);
    setMode("guides");
  }

  function setPreset(columns: number, rows: number) {
    if (!imageEl) {
      return;
    }

    setIsEditingGuides(true);
    setEditedPieceDataUrls({});
    setVerticalGuides(getDefaultGuides(imageEl.width, columns));
    setHorizontalGuides(getDefaultGuides(imageEl.height, rows));
    setSelectedGuide(null);
    setRemovedPieceKeys([]);
  }

  function removePieceByKey(key: string) {
    setRemovedPieceKeys((prev) => (prev.includes(key) ? prev : [...prev, key]));
  }

  function keepPiece(piece: OutputPiece) {
    setSavedPieces((prev) => {
      if (prev.some((savedPiece) => savedPiece.key === piece.key)) {
        return prev;
      }

      return [...prev, { ...piece, savedAt: Date.now() }];
    });
  }

  function updatePieceName(key: string, value: string) {
    setPieceNames((prev) => ({ ...prev, [key]: value }));
  }

  function removeSavedPiece(key: string) {
    setSavedPieces((prev) => prev.filter((piece) => piece.key !== key));
  }

  async function downloadPiece(piece: OutputPiece, index: number) {
    const exportDataUrl = await upscaleDataUrl(piece.dataUrl, exportScale);
    const link = document.createElement("a");
    link.href = exportDataUrl;
    link.download = `${getPieceName(piece, index)}.png`;
    link.click();
  }

  async function downloadAllPngs() {
    const allPieces = [...savedPieces, ...outputPieces.filter((piece) => !savedPieces.some((saved) => saved.key === piece.key))];
    for (const [index, piece] of allPieces.entries()) {
      // Stagger browser downloads slightly so they are less likely to be blocked.
      await downloadPiece(piece, index);
      await new Promise((resolve) => window.setTimeout(resolve, 120));
    }
  }

  async function downloadZip() {
    const zipPieces = [...savedPieces, ...outputPieces.filter((piece) => !savedPieces.some((saved) => saved.key === piece.key))];

    if (zipPieces.length === 0) {
      return;
    }

    setIsExportingZip(true);

    try {
      const zip = new JSZip();

      for (const [index, piece] of zipPieces.entries()) {
        const exportDataUrl = await upscaleDataUrl(piece.dataUrl, exportScale);
        zip.file(`${getPieceName(piece, index)}.png`, dataUrlToBlob(exportDataUrl));
      }

      const blob = await zip.generateAsync({ type: "blob" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);

      link.href = url;
      link.download = `${fileName}-slices.zip`;
      link.click();

      URL.revokeObjectURL(url);
    } finally {
      setIsExportingZip(false);
    }
  }

  function startFreehandDraw(event: React.MouseEvent<HTMLDivElement>) {
    if (mode !== "freehand" || !imageEl || !previewRef.current) {
      if (mode !== "rectangle") {
        return;
      }
    }

    if (!imageEl || !previewRef.current) {
      return;
    }

    const rect = previewRef.current.getBoundingClientRect();
    const x = clamp(event.clientX - rect.left, 0, rect.width);
    const y = clamp(event.clientY - rect.top, 0, rect.height);

    const point = {
      x: Math.round((x / rect.width) * imageEl.width),
      y: Math.round((y / rect.height) * imageEl.height),
    };

    setSelectedGuide(null);

    if (mode === "freehand") {
      setDraftFreehandPoints([point]);
      setIsDrawingFreehand(true);
      return;
    }

    if (mode === "rectangle") {
      setDraftRectSelection({
        startX: point.x,
        startY: point.y,
        endX: point.x,
        endY: point.y,
      });
    }
  }

  function getCleanupCanvasPoint(clientX: number, clientY: number) {
    const canvas = cleanupCanvasRef.current;
    if (!canvas) {
      return null;
    }

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: clamp((clientX - rect.left) * scaleX, 0, canvas.width),
      y: clamp((clientY - rect.top) * scaleY, 0, canvas.height),
    };
  }

  function applyCompletionSelection(selection: Exclude<CleanupSelection, null>) {
    const canvas = cleanupCanvasRef.current;
    const originalCanvas = cleanupOriginalCanvasRef.current;
    if (!canvas || !originalCanvas) {
      return;
    }

    const context = canvas.getContext("2d");
    const originalContext = originalCanvas.getContext("2d", { willReadFrequently: true });
    if (!context || !originalContext) {
      return;
    }

    const currentImageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const sourceImageData = originalContext.getImageData(0, 0, originalCanvas.width, originalCanvas.height);
    const fillRgb = hexToRgb(cleanupFillColor);
    const minX = Math.max(0, Math.floor(Math.min(selection.startX, selection.endX)));
    const maxX = Math.min(canvas.width - 1, Math.ceil(Math.max(selection.startX, selection.endX)));
    const minY = Math.max(0, Math.floor(Math.min(selection.startY, selection.endY)));
    const maxY = Math.min(canvas.height - 1, Math.ceil(Math.max(selection.startY, selection.endY)));

    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const targetOffset = (y * canvas.width + x) * 4;
        const sourceOffset = findNearestSubjectPixel(sourceImageData.data, canvas.width, canvas.height, x, y, fillRgb);
        if (sourceOffset === -1) {
          continue;
        }

        currentImageData.data[targetOffset] = sourceImageData.data[sourceOffset];
        currentImageData.data[targetOffset + 1] = sourceImageData.data[sourceOffset + 1];
        currentImageData.data[targetOffset + 2] = sourceImageData.data[sourceOffset + 2];
        currentImageData.data[targetOffset + 3] = sourceImageData.data[sourceOffset + 3];
      }
    }

    context.putImageData(currentImageData, 0, 0);
  }

  function paintCleanupAt(clientX: number, clientY: number) {
    const canvas = cleanupCanvasRef.current;
    if (!canvas) {
      return;
    }

    const point = getCleanupCanvasPoint(clientX, clientY);
    if (!point) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    if (cleanupTool === "complete") {
      setCleanupSelection((prev) =>
        prev
          ? { ...prev, endX: point.x, endY: point.y }
          : { startX: point.x, startY: point.y, endX: point.x, endY: point.y }
      );
      return;
    }

    context.save();
    context.fillStyle = cleanupFillColor;
    context.strokeStyle = cleanupFillColor;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = cleanupBrushSize;

    if (cleanupLastPointRef.current) {
      context.beginPath();
      context.moveTo(cleanupLastPointRef.current.x, cleanupLastPointRef.current.y);
      context.lineTo(point.x, point.y);
      context.stroke();
    }

    context.beginPath();
    context.arc(point.x, point.y, cleanupBrushSize / 2, 0, Math.PI * 2);
    context.fill();
    context.restore();

    cleanupLastPointRef.current = point;
  }

  function pushCleanupSnapshot() {
    const canvas = cleanupCanvasRef.current;
    if (!canvas) {
      return;
    }

    const snapshot = canvas.toDataURL("image/png");
    setCleanupHistory((prev) => [...prev, snapshot]);
  }

  function startCleanupPaint(event: React.MouseEvent<HTMLCanvasElement>) {
    pushCleanupSnapshot();
    setIsCleanupPainting(true);
    if (cleanupTool === "complete") {
      const point = getCleanupCanvasPoint(event.clientX, event.clientY);
      if (!point) {
        return;
      }

      setCleanupSelection({
        startX: point.x,
        startY: point.y,
        endX: point.x,
        endY: point.y,
      });
      return;
    }

    paintCleanupAt(event.clientX, event.clientY);
  }

  function continueCleanupPaint(event: React.MouseEvent<HTMLCanvasElement>) {
    if (!isCleanupPainting) {
      return;
    }

    paintCleanupAt(event.clientX, event.clientY);
  }

  function stopCleanupPaint() {
    if (cleanupTool === "complete" && cleanupSelection) {
      applyCompletionSelection(cleanupSelection);
      setCleanupSelection(null);
    }

    setIsCleanupPainting(false);
    cleanupLastPointRef.current = null;
  }

  function saveCleanup() {
    if (!cleanupPieceKey || !cleanupCanvasRef.current) {
      return;
    }

    const dataUrl = cleanupCanvasRef.current.toDataURL("image/png");
    setEditedPieceDataUrls((prev) => ({ ...prev, [cleanupPieceKey]: dataUrl }));
    setCleanupPieceKey(null);
  }

  function resetCleanup() {
    if (!cleanupPieceKey) {
      return;
    }

    setEditedPieceDataUrls((prev) => {
      const next = { ...prev };
      delete next[cleanupPieceKey];
      return next;
    });
    setCleanupPieceKey(null);
  }

  async function undoCleanupAction() {
    const canvas = cleanupCanvasRef.current;
    if (!canvas || cleanupHistory.length === 0) {
      return;
    }

    const previousSnapshot = cleanupHistory[cleanupHistory.length - 1];
    const image = await buildImageFromSrc(previousSnapshot);
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0);
    setCleanupHistory((prev) => prev.slice(0, -1));
  }

  function centerCleanupSubject() {
    const canvas = cleanupCanvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      return;
    }

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const { data, width, height } = imageData;
    const fillColor = hexToRgb(cleanupFillColor);
    const tolerance = 26;

    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        const alpha = data[offset + 3];
        if (alpha === 0) {
          continue;
        }

        const delta =
          Math.abs(data[offset] - fillColor.r) +
          Math.abs(data[offset + 1] - fillColor.g) +
          Math.abs(data[offset + 2] - fillColor.b);

        if (delta <= tolerance) {
          continue;
        }

        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }

    if (maxX < minX || maxY < minY) {
      return;
    }

    pushCleanupSnapshot();

    const subjectWidth = maxX - minX + 1;
    const subjectHeight = maxY - minY + 1;
    const subjectImage = context.getImageData(minX, minY, subjectWidth, subjectHeight);

    context.save();
    context.fillStyle = cleanupFillColor;
    context.fillRect(0, 0, canvas.width, canvas.height);

    const targetX = Math.round((canvas.width - subjectWidth) / 2);
    const targetY = Math.round((canvas.height - subjectHeight) / 2);
    context.putImageData(subjectImage, targetX, targetY);
    context.restore();
  }

  function expandCleanupSubject() {
    const canvas = cleanupCanvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      return;
    }

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const { data, width, height } = imageData;
    const fillColor = hexToRgb(cleanupFillColor);
    const tolerance = 26;

    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        const alpha = data[offset + 3];
        if (alpha === 0) {
          continue;
        }

        const delta =
          Math.abs(data[offset] - fillColor.r) +
          Math.abs(data[offset + 1] - fillColor.g) +
          Math.abs(data[offset + 2] - fillColor.b);

        if (delta <= tolerance) {
          continue;
        }

        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }

    if (maxX < minX || maxY < minY) {
      return;
    }

    pushCleanupSnapshot();

    const subjectWidth = maxX - minX + 1;
    const subjectHeight = maxY - minY + 1;
    const subjectCanvas = document.createElement("canvas");
    subjectCanvas.width = subjectWidth;
    subjectCanvas.height = subjectHeight;
    const subjectContext = subjectCanvas.getContext("2d");

    if (!subjectContext) {
      return;
    }

    subjectContext.putImageData(context.getImageData(minX, minY, subjectWidth, subjectHeight), 0, 0);

    const maxTargetWidth = canvas.width * 0.84;
    const maxTargetHeight = canvas.height * 0.84;
    const scale = Math.min(maxTargetWidth / subjectWidth, maxTargetHeight / subjectHeight);
    const targetWidth = Math.max(1, Math.round(subjectWidth * scale));
    const targetHeight = Math.max(1, Math.round(subjectHeight * scale));
    const targetX = Math.round((canvas.width - targetWidth) / 2);
    const targetY = Math.round((canvas.height - targetHeight) / 2);

    context.save();
    context.fillStyle = cleanupFillColor;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = true;
    context.drawImage(subjectCanvas, 0, 0, subjectWidth, subjectHeight, targetX, targetY, targetWidth, targetHeight);
    context.restore();
  }

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Image Slicer Tool</p>
          <h1>Cut one image into clean PNG pieces in a few seconds.</h1>
          <p className="hero-copy">
            Upload an image, drag vertical and horizontal guides, preview the result, and export every slice
            individually or as one ZIP.
          </p>
          <p className="hero-copy">
            You can also switch to freehand mode, circle any shape with the mouse, and turn that selection into
            a rectangular image.
          </p>
          {isEditingGuides && imageEl ? (
            <p className="editing-note">Editing lines... slices will refresh automatically when you finish.</p>
          ) : null}
        </div>
        <div className="hero-stats">
          <div className="stat-card">
            <span>Slices</span>
            <strong>{outputPieces.length + savedPieces.length}</strong>
          </div>
          <div className="stat-card">
            <span>Guides</span>
            <strong>{verticalGuides.length + horizontalGuides.length}</strong>
          </div>
          <div className="stat-card">
            <span>Zoom</span>
            <strong>{scale}%</strong>
          </div>
        </div>
      </section>

      <section className="workspace">
        <aside className="panel">
          <div className="panel-block">
            <label className="field">
              <span>Upload image</span>
              <input type="file" accept="image/*" onChange={handleFileChange} />
            </label>
          </div>

          <div className="panel-block">
            <label className="field">
              <span>Base file name</span>
              <input value={fileName} onChange={(event) => setFileName(event.target.value || "image")} />
            </label>
          </div>

          <div className="panel-block">
            <span className="block-title">Cut mode</span>
            <div className="button-row">
              <button
                className={mode === "guides" ? "active-mode-button" : ""}
                onClick={() => setMode("guides")}
                disabled={!imageEl}
              >
                Straight guides
              </button>
              <button
                className={mode === "freehand" ? "active-mode-button" : ""}
                onClick={() => setMode("freehand")}
                disabled={!imageEl}
              >
                Freehand draw
              </button>
              <button
                className={mode === "rectangle" ? "active-mode-button" : ""}
                onClick={() => setMode("rectangle")}
                disabled={!imageEl}
              >
                Rectangle crop
              </button>
            </div>
          </div>

          <div className="panel-block">
            <span className="block-title">Quick presets</span>
            <div className="button-grid">
              <button onClick={() => setPreset(2, 1)} disabled={!imageEl || mode !== "guides"}>
                2 columns
              </button>
              <button onClick={() => setPreset(3, 1)} disabled={!imageEl || mode !== "guides"}>
                3 columns
              </button>
              <button onClick={() => setPreset(2, 2)} disabled={!imageEl || mode !== "guides"}>
                2 x 2
              </button>
              <button onClick={() => setPreset(3, 2)} disabled={!imageEl || mode !== "guides"}>
                3 x 2
              </button>
            </div>
          </div>

          {mode === "rectangle" ? (
            <div className="panel-block">
              <span className="block-title">Rectangle Output Size</span>
              <div className="rectangle-preset-list">
                {RECTANGLE_SIZE_PRESETS.map((preset) => (
                  <button
                    key={`${preset.width}-${preset.height}`}
                    className={
                      rectangleTargetWidth === preset.width && rectangleTargetHeight === preset.height
                        ? "rectangle-preset-button rectangle-preset-button-active"
                        : "rectangle-preset-button"
                    }
                    onClick={() => applyRectanglePreset(preset.width, preset.height)}
                  >
                    <strong>{preset.label}</strong>
                    <span>{preset.description}</span>
                  </button>
                ))}
              </div>
              <label className="field">
                <span>Width</span>
                <input
                  type="number"
                  min="200"
                  step="50"
                  value={rectangleTargetWidth}
                  onChange={(event) => setRectangleTargetWidth(Math.max(200, Number(event.target.value) || 200))}
                />
              </label>
              <label className="field">
                <span>Height</span>
                <input
                  type="number"
                  min="200"
                  step="50"
                  value={rectangleTargetHeight}
                  onChange={(event) => setRectangleTargetHeight(Math.max(200, Number(event.target.value) || 200))}
                />
              </label>
            </div>
          ) : null}

          <div className="panel-block">
            <span className="block-title">Guides</span>
            <div className="button-row">
              <button onClick={() => addGuide("v")} disabled={!imageEl || mode !== "guides"}>
                <Plus size={16} />
                Add vertical
              </button>
              <button onClick={() => addGuide("h")} disabled={!imageEl || mode !== "guides"}>
                <Plus size={16} />
                Add horizontal
              </button>
            </div>
            <div className="button-row">
              <button onClick={() => removeLastGuide("v")} disabled={!imageEl || mode !== "guides" || verticalGuides.length === 0}>
                <Trash2 size={16} />
                Remove vertical
              </button>
              <button
                onClick={() => removeLastGuide("h")}
                disabled={!imageEl || mode !== "guides" || horizontalGuides.length === 0}
              >
                <Trash2 size={16} />
                Remove horizontal
              </button>
            </div>
            <button
              className="danger-button"
              onClick={deleteSelectedGuide}
              disabled={!selectedGuide || mode !== "guides"}
            >
              <Trash2 size={16} />
              Delete selected guide
            </button>
            <button className="danger-button" onClick={clearWorkspace} disabled={!imageEl && !imageSrc}>
              <Trash2 size={16} />
              Clear image and reset
            </button>
          </div>

          <div className="panel-block">
            <label className="field">
              <span>Preview zoom: {scale}%</span>
              <input
                type="range"
                min="30"
                max="160"
                step="5"
                value={scale}
                onChange={(event) => setScale(Number(event.target.value))}
              />
            </label>
          </div>

          <div className="panel-block export-block">
            <label className="field">
              <span>Export quality</span>
              <select value={exportScale} onChange={(event) => setExportScale(Number(event.target.value))}>
                <option value={1}>Standard 1x</option>
                <option value={2}>Enhanced 2x</option>
                <option value={3}>Enhanced 3x</option>
              </select>
            </label>
            <button
              className="primary-button"
              onClick={downloadAllPngs}
              disabled={outputPieces.length + savedPieces.length === 0 || isExportingZip}
            >
              <Download size={16} />
              Download All PNGs
            </button>
            <button
              className="primary-button"
              onClick={downloadZip}
              disabled={outputPieces.length + savedPieces.length === 0 || isExportingZip}
            >
              <Download size={16} />
              {isExportingZip ? "Building ZIP..." : "Download ZIP"}
            </button>
              <p className="hint">
                {mode === "guides"
                  ? "Tip: click a guide to select it, then remove it if you need to adjust the layout."
                  : mode === "freehand"
                    ? "Tip: press and drag around the object. When you release the mouse, a rectangular cutout is created."
                    : "Tip: drag a rectangle around the object. The result will be centered inside your fixed output size with matching background color."}
              </p>
            </div>
        </aside>

        <section className="main-panel">
          <div className="canvas-card">
            <div className="canvas-header">
              <div>
                <h2>Live preview</h2>
                <p>
                  {mode === "guides"
                    ? "Drag the cut lines directly on the image."
                    : mode === "freehand"
                      ? "Draw freely around any object you want to extract."
                      : "Drag a rectangle around the object you want to cut automatically."}
                </p>
              </div>
              <div className="legend">
                <span>
                  <Move size={14} />
                  Drag guides
                </span>
                <span>
                  <Scissors size={14} />
                  Freehand selection
                </span>
                <span>
                  <Grid2x2Plus size={14} />
                  Mixed output
                </span>
              </div>
            </div>

            {imageSrc && imageEl ? (
              <div className="preview-stage">
                <div
                  ref={previewRef}
                  className={`preview-frame ${mode === "freehand" ? "freehand-mode" : ""}`}
                  style={{ width: `${(imageEl.width * scale) / 100}px` }}
                  onMouseDown={startFreehandDraw}
                >
                  <img src={imageSrc} alt="Preview" className="preview-image" draggable={false} />

                  {mode === "guides" &&
                    verticalGuides.map((guide, index) => (
                      <button
                        key={`v-${guide}-${index}`}
                        className={`guide guide-vertical ${
                          selectedGuide?.type === "v" && selectedGuide.index === index ? "guide-selected" : ""
                        }`}
                        style={{ left: `${(guide / imageEl.width) * 100}%` }}
                        onMouseDown={() => setDragging({ type: "v", index })}
                        onClick={() => setSelectedGuide({ type: "v", index })}
                        title={`Vertical guide ${index + 1}`}
                      />
                    ))}

                  {mode === "guides" &&
                    horizontalGuides.map((guide, index) => (
                      <button
                        key={`h-${guide}-${index}`}
                        className={`guide guide-horizontal ${
                          selectedGuide?.type === "h" && selectedGuide.index === index ? "guide-selected" : ""
                        }`}
                        style={{ top: `${(guide / imageEl.height) * 100}%` }}
                        onMouseDown={() => setDragging({ type: "h", index })}
                        onClick={() => setSelectedGuide({ type: "h", index })}
                        title={`Horizontal guide ${index + 1}`}
                      />
                    ))}

                  {mode === "freehand" ? (
                    <svg className="freehand-overlay" viewBox={`0 0 ${imageEl.width} ${imageEl.height}`} preserveAspectRatio="none">
                      {freehandRegions
                        .filter((region) => !removedPieceKeys.includes(region.key))
                        .map((region) => (
                          <path key={region.key} d={`${createRegionPath(region.points)} Z`} className="freehand-region" />
                        ))}
                      {draftFreehandPoints.length > 1 ? (
                        <path d={createRegionPath(draftFreehandPoints)} className="freehand-draft" />
                      ) : null}
                    </svg>
                  ) : null}
                  {mode === "rectangle" && draftRectSelection ? (
                    <div
                      className="preview-rect-selection"
                      style={{
                        left: `${(Math.min(draftRectSelection.startX, draftRectSelection.endX) / imageEl.width) * 100}%`,
                        top: `${(Math.min(draftRectSelection.startY, draftRectSelection.endY) / imageEl.height) * 100}%`,
                        width: `${(Math.abs(draftRectSelection.endX - draftRectSelection.startX) / imageEl.width) * 100}%`,
                        height: `${(Math.abs(draftRectSelection.endY - draftRectSelection.startY) / imageEl.height) * 100}%`,
                      }}
                    />
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <ImageIcon size={42} />
                <h3>No image loaded yet</h3>
                <p>Upload a JPG or PNG to start slicing.</p>
              </div>
            )}
          </div>

          <div className="slices-card">
            <div className="canvas-header">
              <div>
                <h2>Output pieces</h2>
                <p>
                  {isEditingGuides && imageEl && mode === "guides"
                    ? "Finish adjusting the guides and the slices will be created automatically."
                    : outputPieces.length > 0
                      ? `${outputPieces.length} PNG slices ready for export.`
                      : "Your slices will appear here after a cut layout is complete."}
                </p>
              </div>
            </div>

            {cleanupPiece ? (
              <div className="cleanup-editor">
                <div className="cleanup-header">
                  <div>
                    <strong>Cleanup {cleanupPiece.label}</strong>
                    <p>Pick a tool, then either paint with a chosen color or mark an area for non-AI completion from the original piece.</p>
                  </div>
                  <div className="cleanup-actions">
                    <button onClick={undoCleanupAction} disabled={cleanupHistory.length === 0}>
                      Undo last edit
                    </button>
                    <button onClick={resetCleanup}>Reset piece</button>
                    <button onClick={centerCleanupSubject}>Center subject</button>
                    <button onClick={expandCleanupSubject}>Complete without AI</button>
                    <button onClick={() => setCleanupPieceKey(null)}>Cancel</button>
                    <button className="primary-button cleanup-save-button" onClick={saveCleanup}>
                      Save cleanup
                    </button>
                  </div>
                </div>
                <div className="cleanup-tool-row">
                  <button
                    className={cleanupTool === "paint" ? "active-mode-button" : ""}
                    onClick={() => setCleanupTool("paint")}
                  >
                    Paint color
                  </button>
                  <button
                    className={cleanupTool === "complete" ? "active-mode-button" : ""}
                    onClick={() => setCleanupTool("complete")}
                  >
                    Complete selected area
                  </button>
                </div>
                <label className="field cleanup-field">
                  <span>Fill color</span>
                  <input
                    className="cleanup-color-input"
                    type="color"
                    value={cleanupFillColor}
                    onChange={(event) => setCleanupFillColor(event.target.value)}
                    disabled={cleanupTool !== "paint"}
                  />
                </label>
                <label className="field cleanup-field">
                  <span>Brush size: {cleanupBrushSize}px</span>
                  <input
                    type="range"
                    min="8"
                    max="80"
                    step="2"
                    value={cleanupBrushSize}
                    onChange={(event) => setCleanupBrushSize(Number(event.target.value))}
                  />
                </label>
                <div className="cleanup-canvas-wrap">
                  <div className="cleanup-canvas-stage">
                    <canvas
                      ref={cleanupCanvasRef}
                      className="cleanup-canvas"
                      onMouseDown={startCleanupPaint}
                      onMouseMove={continueCleanupPaint}
                      onMouseUp={stopCleanupPaint}
                      onMouseLeave={stopCleanupPaint}
                    />
                    {cleanupSelection && cleanupCanvasRef.current ? (
                      <div
                        className="cleanup-selection"
                        style={{
                          left: `${(Math.min(cleanupSelection.startX, cleanupSelection.endX) / cleanupCanvasRef.current.width) * 100}%`,
                          top: `${(Math.min(cleanupSelection.startY, cleanupSelection.endY) / cleanupCanvasRef.current.height) * 100}%`,
                          width: `${(Math.abs(cleanupSelection.endX - cleanupSelection.startX) / cleanupCanvasRef.current.width) * 100}%`,
                          height: `${(Math.abs(cleanupSelection.endY - cleanupSelection.startY) / cleanupCanvasRef.current.height) * 100}%`,
                        }}
                      />
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}

            {savedPieces.length > 0 ? (
              <div className="saved-pieces-block">
                <div className="canvas-header">
                  <div>
                    <h2>Saved pieces</h2>
                    <p>These pieces stay here even if you change guides or create new cuts.</p>
                  </div>
                </div>
                <div className="slice-grid">
                  {savedPieces.map((piece, index) => (
                    <article key={`${piece.key}-saved-${index}`} className="slice-tile saved-piece-tile">
                      <div className="slice-preview">
                        <img src={piece.dataUrl} alt={piece.label} />
                      </div>
                      <div className="slice-meta">
                        <strong>{piece.label}</strong>
                        <span>
                          {piece.width} x {piece.height}px
                        </span>
                      </div>
                      <label className="field piece-name-field">
                        <span>Image name</span>
                        <input
                          value={pieceNames[piece.key] ?? ""}
                          onChange={(event) => updatePieceName(piece.key, event.target.value)}
                          placeholder={getPieceName(piece, index)}
                        />
                      </label>
                      <button onClick={() => downloadPiece(piece, index)}>
                        <Download size={14} />
                        Download PNG
                      </button>
                      <button className="slice-delete-button" onClick={() => removeSavedPiece(piece.key)}>
                        <Trash2 size={14} />
                        Remove saved
                      </button>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="slice-grid">
              {!isEditingGuides &&
                imageEl &&
                outputPieces.map((piece, index) => (
                  <article key={`${piece.key}-${index}`} className="slice-tile">
                    <div className="slice-preview">
                      <img src={piece.dataUrl} alt={`${piece.label} ${index + 1}`} />
                    </div>
                    <div className="slice-meta">
                      <strong>{piece.label}</strong>
                      <span>
                        {piece.width} x {piece.height}px
                      </span>
                    </div>
                    <label className="field piece-name-field">
                      <span>Image name</span>
                      <input
                        value={pieceNames[piece.key] ?? ""}
                        onChange={(event) => updatePieceName(piece.key, event.target.value)}
                        placeholder={getPieceName(piece, index)}
                      />
                    </label>
                    <button onClick={() => downloadPiece(piece, index)}>
                      <Download size={14} />
                      Download PNG
                    </button>
                    <button onClick={() => keepPiece(piece)} disabled={savedPieces.some((savedPiece) => savedPiece.key === piece.key)}>
                      <Plus size={14} />
                      {savedPieces.some((savedPiece) => savedPiece.key === piece.key) ? "Saved" : "Keep piece"}
                    </button>
                    <button onClick={() => setCleanupPieceKey(piece.key)}>
                      <Scissors size={14} />
                      Cleanup
                    </button>
                    <button className="slice-delete-button" onClick={() => removePieceByKey(piece.key)}>
                      <Trash2 size={14} />
                      Remove piece
                    </button>
                  </article>
                ))}
              {!isEditingGuides && imageEl && outputPieces.length === 0 ? (
                <div className="slice-placeholder">
                  {mode === "guides"
                    ? "Add at least one guide to create closed cut areas inside the image frame."
                    : "Draw around any object with the mouse, and the selected shape will be exported inside a rectangular image."}
                </div>
              ) : null}
              {isEditingGuides && imageEl && mode === "guides" ? (
                <div className="slice-placeholder">
                  Waiting for you to finish editing the guides before generating the image pieces.
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
