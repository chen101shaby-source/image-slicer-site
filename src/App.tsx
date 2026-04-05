import { useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import {
  Copy,
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

type SliceUploadState = {
  previewUrl: string;
  blob: Blob;
  uploadedUrl: string | null;
  uploading: boolean;
  error: string | null;
};

type AppNoticeTone = "info" | "error" | "success";

type AppNotice = {
  text: string;
  tone: AppNoticeTone;
} | null;

const RECTANGLE_SIZE_PRESETS = [
  { width: 800, height: 800, label: "800 x 800", description: "Good for fast-loading square product images." },
  { width: 1080, height: 1080, label: "1080 x 1080", description: "Great for digital catalogs and social-ready square images." },
  { width: 1200, height: 1200, label: "1200 x 1200", description: "Best balanced choice for high-quality e-commerce product photos." },
  { width: 1200, height: 1600, label: "1200 x 1600", description: "Better for tall products and portrait-style product cards." },
] as const;

type CleanupTool = "paint" | "complete";
type Locale = "en" | "he";
type CleanupSelection = {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
} | null;

const translations = {
  en: {
    builtFor: "Built for clean asset workflows",
    heroTitle: "Cut one image into clean PNG pieces",
    heroCopy:
      "A focused image slicing workspace for developers, ecommerce teams, and site builders who need fast, reusable PNG assets and shareable hosted image URLs without the clutter.",
    editingNote: "Guide mode is waiting for you. Click Generate guide slices when the lines are ready.",
    slices: "Slices",
    guides: "Guides",
    zoom: "Zoom",
    controls: "Controls",
    controlsCopy: "Upload, name, format, and export your assets.",
    uploadImage: "Upload image",
    chooseImageFile: "Choose Image File",
    noFileSelected: "No file selected",
    baseFileName: "Base file name",
    quickPresets: "Quick presets",
    twoByTwo: "2 x 2",
    threeByThree: "3 x 3",
    fourByFour: "4 x 4",
    customGrid: "Custom grid",
    applyGrid: "Apply grid",
    rectangleOutputSize: "Rectangle Output Size",
    width: "Width",
    height: "Height",
    guidesTitle: "Guides",
    deleteSelectedGuide: "Delete selected guide",
    clearImageAndReset: "Clear image and reset",
    deleteEverything: "Delete Everything",
    confirmDeleteAll: "Delete everything and start over?",
    previewZoom: "Preview zoom",
    globalActions: "Global Actions",
    globalActionsCopy: "Export, upload, and copy outputs in bulk.",
    exportQuality: "Export quality",
    standard1x: "Standard 1x",
    enhanced2x: "Enhanced 2x",
    enhanced3x: "Enhanced 3x",
    downloadAllPngs: "Download All PNGs",
    uploadAllCloudinary: "Create Links for All Images",
    copyAllLinks: "Copy All Links",
    copyAllHtml: "Copy All HTML",
    autoUpload: "Auto Upload new pieces",
    downloadZip: "Download ZIP",
    buildingZip: "Building ZIP...",
    guidesHint: "Tip: add and adjust the guide lines first, then click Generate guide slices to create the images.",
    freehandHint: "Tip: press and drag around the object. When you release the mouse, a rectangular cutout is created.",
    rectangleHint: "Tip: drag a rectangle around the object. The result will be centered inside your fixed output size with matching background color.",
    livePreview: "Live preview",
    guidesPreviewCopy: "Add and move guide lines, then generate the slices when you are ready.",
    freehandPreviewCopy: "Draw freely around any object you want to extract.",
    rectanglePreviewCopy: "Drag a rectangle around the object you want to cut automatically.",
    dragGuides: "Drag guides",
    freehandSelection: "Freehand selection",
    mixedOutput: "Mixed output",
    dropImageTitle: "Drop an image here or click to upload",
    dropImageCopy: "Use JPG or PNG files to start slicing.",
    chooseYourCuttingTool: "Choose Your Cutting Tool",
    chooseYourCuttingToolCopy: "Pick the workflow you want to use before creating your image pieces.",
    recommendedRectangle: "Recommended: Rectangle crop",
    rectangleCrop: "Rectangle crop",
    rectangleCropCopy: "The easiest option for clean product images.",
    freehandDraw: "Freehand draw",
    freehandDrawCopy: "Useful when the shape is irregular and needs a hand-drawn cut.",
    straightGuides: "Straight guides",
    straightGuidesCopy: "Best when you want to divide one image into several clean sections.",
    addVertical: "Add vertical",
    addHorizontal: "Add horizontal",
    removeVertical: "Remove vertical",
    removeHorizontal: "Remove horizontal",
    generateGuideSlices: "Generate Guide Slices",
    generateGuideSlicesCopy: "Create all guide-based image pieces only when your vertical and horizontal lines are ready.",
    outputPieces: "Output pieces",
    guideSlicesWaiting: "Guide slices are not generated yet. Click Generate guide slices when you are ready.",
    pngReady: "PNG slices ready for export.",
    slicesAppearLater: "Your slices will appear here after a cut layout is complete.",
    cleanup: "Cleanup",
    cleanupCopy: "Pick a tool, then either paint with a chosen color or mark an area for non-AI completion from the original piece.",
    undoLastEdit: "Undo last edit",
    resetPiece: "Reset piece",
    centerSubject: "Center subject",
    completeWithoutAi: "Complete without AI",
    cancel: "Cancel",
    saveCleanup: "Save cleanup",
    paintColor: "Paint color",
    completeSelectedArea: "Complete selected area",
    fillColor: "Fill color",
    brushSize: "Brush size",
    savedPieces: "Saved pieces",
    savedPiecesCopy: "These pieces stay here even if you change guides or create new cuts.",
    imageName: "Image name",
    download: "Download",
    upload: "Create web link",
    copyLink: "Copy Link",
    copyHtml: "Copy HTML",
    removeSaved: "Remove saved",
    saved: "Saved",
    keepPiece: "Keep piece",
    removePiece: "Remove piece",
    readyToExport: "Ready to export",
    savedPiece: "Saved piece",
    addGuidePlaceholder: "Add at least one guide to create closed cut areas inside the image frame.",
    freehandPlaceholder: "Draw around any object with the mouse, and the selected shape will be exported inside a rectangular image.",
    guidesWaiting: "Add or adjust the guide lines, then click Generate guide slices to create the image pieces.",
    uploadCompleted: "Upload completed.",
    uploadFailed: "Upload failed",
    linkCopied: "Link copied.",
    htmlCopied: "HTML copied.",
    allLinksCopied: "All links copied.",
    allHtmlCopied: "All HTML copied.",
    noUploadedImagesYet: "No uploaded images yet.",
    copyFailed: "Copy failed. Please try again.",
    copyFailedManual: "Copy failed. Please copy the link manually.",
    language: "עברית",
    verticalGuideTitle: "Vertical guide",
    horizontalGuideTitle: "Horizontal guide",
    noImageLoadedYet: "No image loaded yet",
    uploadJpgPng: "Upload a JPG or PNG to start slicing.",
  },
  he: {
    builtFor: "נבנה לזרימות עבודה נקיות של נכסי תמונה",
    heroTitle: "חתוך תמונה אחת לחלקי PNG נקיים",
    heroCopy:
      "סביבת עבודה ממוקדת למפתחים, חנויות אונליין ובוני אתרים שצריכים נכסי PNG מהירים, ניתנים לשימוש חוזר, וקישורי תמונה מאוחסנים לשיתוף.",
    editingNote: "מצב הקווים ממתין לך. לחץ על יצירת חיתוכים מהקווים כשהקווים מוכנים.",
    slices: "חתיכות",
    guides: "קווים",
    zoom: "זום",
    controls: "בקרות",
    controlsCopy: "העלה, תן שם, בחר פורמט וייצא את הנכסים שלך.",
    uploadImage: "העלאת תמונה",
    chooseImageFile: "בחר קובץ תמונה",
    noFileSelected: "לא נבחר קובץ",
    baseFileName: "שם בסיס לקובץ",
    quickPresets: "תבניות מהירות",
    columns2: "2 עמודות",
    columns3: "3 עמודות",
    twoByTwo: "2 על 2",
    threeByTwo: "3 על 2",
    rectangleOutputSize: "גודל פלט למלבן",
    width: "רוחב",
    height: "גובה",
    guidesTitle: "קווי חיתוך",
    deleteSelectedGuide: "מחק קו נבחר",
    clearImageAndReset: "נקה תמונה ואפס",
    previewZoom: "זום תצוגה",
    globalActions: "פעולות כלליות",
    globalActionsCopy: "ייצוא, העלאה והעתקה של כל הפלטים במקום אחד.",
    exportQuality: "איכות ייצוא",
    standard1x: "רגיל 1x",
    enhanced2x: "משופר 2x",
    enhanced3x: "משופר 3x",
    downloadAllPngs: "הורד את כל קבצי ה‑PNG",
    uploadAllCloudinary: "העלה הכול ל‑Cloudinary",
    copyAllLinks: "העתק את כל הקישורים",
    copyAllHtml: "העתק את כל ה‑HTML",
    autoUpload: "העלאה אוטומטית לחתיכות חדשות",
    downloadZip: "הורד ZIP",
    buildingZip: "בונה ZIP...",
    guidesHint: "טיפ: הוסף וערוך את קווי החיתוך, ואז לחץ על יצירת חיתוכים מהקווים כדי ליצור את התמונות.",
    freehandHint: "טיפ: לחץ וגרור סביב האובייקט. כשמשחררים את העכבר נוצרת חתיכה מלבנית.",
    rectangleHint: "טיפ: גרור מלבן סביב האובייקט. התוצאה תיושר למרכז בגודל קבוע עם רקע תואם.",
    livePreview: "תצוגה חיה",
    guidesPreviewCopy: "הוסף והזז קווים, ואז צור את החתיכות כשתהיה מוכן.",
    freehandPreviewCopy: "צייר בחופשיות סביב כל אובייקט שתרצה לחלץ.",
    rectanglePreviewCopy: "גרור מלבן סביב האובייקט שתרצה לחתוך אוטומטית.",
    dragGuides: "גרירת קווים",
    freehandSelection: "בחירה חופשית",
    mixedOutput: "פלט משולב",
    dropImageTitle: "גרור תמונה לכאן או לחץ כדי להעלות",
    dropImageCopy: "השתמש בקבצי JPG או PNG כדי להתחיל לחתוך.",
    chooseYourCuttingTool: "בחר את כלי החיתוך שלך",
    chooseYourCuttingToolCopy: "בחר את שיטת העבודה לפני יצירת חתיכות התמונה.",
    recommendedRectangle: "מומלץ: חיתוך מלבני",
    rectangleCrop: "חיתוך מלבני",
    rectangleCropCopy: "האפשרות הכי נוחה לתמונות מוצר נקיות.",
    freehandDraw: "חיתוך חופשי",
    freehandDrawCopy: "שימושי כשיש צורה לא סדירה שצריך לחתוך ביד.",
    straightGuides: "קווים ישרים",
    straightGuidesCopy: "הכי מתאים כשצריך לחלק תמונה אחת לכמה חלקים נקיים.",
    addVertical: "הוסף קו אנכי",
    addHorizontal: "הוסף קו אופקי",
    removeVertical: "הסר קו אנכי",
    removeHorizontal: "הסר קו אופקי",
    generateGuideSlices: "צור חתיכות מהקווים",
    generateGuideSlicesCopy: "יוצר את כל החתיכות רק כשהקווים האנכיים והאופקיים מוכנים.",
    outputPieces: "חתיכות פלט",
    guideSlicesWaiting: "חתיכות מהקווים עדיין לא נוצרו. לחץ על יצירת חיתוכים מהקווים כשתהיה מוכן.",
    pngReady: "חתיכות PNG מוכנות לייצוא.",
    slicesAppearLater: "החתיכות שלך יופיעו כאן אחרי שהחיתוך יהיה מוכן.",
    cleanup: "ניקוי",
    cleanupCopy: "בחר כלי, ואז או לצבוע בצבע שבחרת או לסמן אזור להשלמה חכמה ללא AI.",
    undoLastEdit: "בטל עריכה אחרונה",
    resetPiece: "אפס חתיכה",
    centerSubject: "מרכז אובייקט",
    completeWithoutAi: "השלם ללא AI",
    cancel: "ביטול",
    saveCleanup: "שמור ניקוי",
    paintColor: "צביעה בצבע",
    completeSelectedArea: "השלמת אזור נבחר",
    fillColor: "צבע מילוי",
    brushSize: "גודל מברשת",
    savedPieces: "חתיכות שמורות",
    savedPiecesCopy: "החתיכות האלו נשארות גם אם משנים קווים או יוצרים חיתוכים חדשים.",
    imageName: "שם תמונה",
    download: "הורדה",
    upload: "העלה",
    copyLink: "העתק קישור",
    copyHtml: "העתק HTML",
    removeSaved: "הסר שמורה",
    saved: "נשמר",
    keepPiece: "שמור חתיכה",
    removePiece: "הסר חתיכה",
    readyToExport: "מוכן לייצוא",
    savedPiece: "חתיכה שמורה",
    addGuidePlaceholder: "הוסף לפחות קו אחד כדי ליצור אזורי חיתוך סגורים בתוך המסגרת.",
    freehandPlaceholder: "צייר סביב כל אובייקט עם העכבר, והצורה שנבחרה תיוצא בתוך תמונה מלבנית.",
    guidesWaiting: "הוסף או ערוך את קווי החיתוך, ואז לחץ על יצירת חתיכות מהקווים.",
    uploadCompleted: "ההעלאה הושלמה.",
    uploadFailed: "ההעלאה נכשלה",
    linkCopied: "הקישור הועתק.",
    htmlCopied: "ה‑HTML הועתק.",
    allLinksCopied: "כל הקישורים הועתקו.",
    allHtmlCopied: "כל ה‑HTML הועתק.",
    noUploadedImagesYet: "עדיין אין תמונות שהועלו.",
    copyFailed: "ההעתקה נכשלה. נסה שוב.",
    copyFailedManual: "ההעתקה נכשלה. העתק ידנית את הקישור.",
    language: "English",
    verticalGuideTitle: "קו אנכי",
    horizontalGuideTitle: "קו אופקי",
    noImageLoadedYet: "עדיין לא נטענה תמונה",
    uploadJpgPng: "העלה קובץ JPG או PNG כדי להתחיל לחתוך.",
  },
} as const;

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

async function uploadToCloudinary(blob: Blob) {
  const formData = new FormData();
  formData.append("file", blob);
  formData.append("upload_preset", "image_slicer_upload");

  const response = await fetch("https://api.cloudinary.com/v1_1/drpib54ix/image/upload", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error("Cloudinary upload failed");
  }

  const data = await response.json();
  return data.secure_url as string;
}

function slugifyName(value: string) {
  const trimmed = value.trim().toLowerCase();
  const withoutSpecialChars = trimmed.replace(/[^a-z0-9\s-]/g, "");
  const withHyphens = withoutSpecialChars.replace(/\s+/g, "-").replace(/-+/g, "-");
  return withHyphens.replace(/^-|-$/g, "") || "image";
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
  const backgroundColor = "#ffffff";

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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
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
  const [customGuideColumns, setCustomGuideColumns] = useState(2);
  const [customGuideRows, setCustomGuideRows] = useState(2);
  const [selectedFileLabel, setSelectedFileLabel] = useState("No file selected");
  const [isDragActive, setIsDragActive] = useState(false);
  const [locale, setLocale] = useState<Locale>("en");
  const [mode, setMode] = useState<Mode>("rectangle");
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
  const [sliceUploads, setSliceUploads] = useState<Record<string, SliceUploadState>>({});
  const [autoUploadEnabled, setAutoUploadEnabled] = useState(false);
  const [appNotice, setAppNotice] = useState<AppNotice>(null);
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
  const noticeTimeoutRef = useRef<number | null>(null);

  function applyRectanglePreset(width: number, height: number) {
    setRectangleTargetWidth(width);
    setRectangleTargetHeight(height);
  }

  const t = translations[locale];
  const quickGridText = {
    threeByThree: locale === "he" ? "3 על 3" : "3 x 3",
    fourByFour: locale === "he" ? "4 על 4" : "4 x 4",
    customGrid: locale === "he" ? "גריד מותאם" : "Custom grid",
    applyGrid: locale === "he" ? "החל גריד" : "Apply grid",
  };
  const deleteEverythingText = locale === "he" ? "מחק הכול" : "Delete Everything";
  const confirmDeleteAllText = locale === "he" ? "למחוק הכול ולהתחיל מחדש?" : "Delete everything and start over?";
  const clearPrimaryImageText = locale === "he" ? "מחק תמונה ראשית" : "Delete main image";
  const clearCutImagesText = locale === "he" ? "מחק תמונות חתוכות" : "Delete cut images";
  const confirmClearPrimaryText =
    locale === "he"
      ? "למחוק את התמונה הראשית בלבד? התמונות שנוצרו יישארו."
      : "Delete only the main image? The generated pieces will stay.";
  const confirmClearCutImagesText =
    locale === "he"
      ? "למחוק את כל התמונות החתוכות בלבד? התמונה הראשית תישאר."
      : "Delete only the cut images? The main image will stay.";

  function showNotice(text: string, tone: AppNoticeTone) {
    setAppNotice({ text, tone });
    if (noticeTimeoutRef.current) {
      window.clearTimeout(noticeTimeoutRef.current);
    }
    noticeTimeoutRef.current = window.setTimeout(() => {
      setAppNotice(null);
    }, 2600);
  }

  function selectMode(nextMode: Mode) {
    setMode(nextMode);
    if (nextMode !== "guides") {
      setIsEditingGuides(false);
    }
  }

  const getPieceName = (piece: OutputPiece, index: number) => {
    const customName = pieceNames[piece.key]?.trim();
    if (customName) {
      return slugifyName(customName);
    }

    return `${slugifyName(fileName)}-${index + 1}`;
  };

  const getPieceAltText = (piece: OutputPiece, index: number) => {
    const customName = pieceNames[piece.key]?.trim();
    return customName || getPieceName(piece, index);
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
      if (noticeTimeoutRef.current) {
        window.clearTimeout(noticeTimeoutRef.current);
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
          setIsEditingGuides(false);
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
          setIsEditingGuides(false);
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

  const visibleAndSavedPieces = useMemo(() => {
    return [...savedPieces, ...outputPieces.filter((piece) => !savedPieces.some((saved) => saved.key === piece.key))];
  }, [outputPieces, savedPieces]);

  useEffect(() => {
    setSliceUploads((prev) => {
      const next: Record<string, SliceUploadState> = {};

      visibleAndSavedPieces.forEach((piece) => {
        const existing = prev[piece.key];
        const blob = dataUrlToBlob(piece.dataUrl);

        next[piece.key] = {
          previewUrl: piece.dataUrl,
          blob,
          uploadedUrl: existing?.uploadedUrl ?? null,
          uploading: existing?.uploading ?? false,
          error: existing?.error ?? null,
        };
      });

      return next;
    });
  }, [visibleAndSavedPieces]);

  useEffect(() => {
    if (!autoUploadEnabled) {
      return;
    }

    const nextPieceToUpload = visibleAndSavedPieces.find((piece) => {
      const uploadState = sliceUploads[piece.key];
      return uploadState && !uploadState.uploadedUrl && !uploadState.uploading;
    });

    if (nextPieceToUpload) {
      void uploadPiece(nextPieceToUpload);
    }
  }, [autoUploadEnabled, sliceUploads, visibleAndSavedPieces]);

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

  async function loadFile(file: File) {
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
    setSelectedFileLabel(file.name);
    setVerticalGuides([]);
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
    setSliceUploads({});
    setDraftFreehandPoints([]);
    setDraftRectSelection(null);
    setSelectedGuide(null);
    setMode("rectangle");
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    await loadFile(file);
    event.target.value = "";
  }

  async function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragActive(false);

    const file = event.dataTransfer.files?.[0];
    if (!file) {
      return;
    }

    await loadFile(file);
  }

  function addGuide(type: "v" | "h") {
    if (!imageEl) {
      return;
    }

    if (type === "v") {
      setIsEditingGuides(true);
      setEditedPieceDataUrls({});
      setCommittedVerticalGuides([]);
      setCommittedHorizontalGuides([]);
      setVerticalGuides((prev) => sortUnique([...prev, Math.round(imageEl.width / 2)], 1, imageEl.width - 1));
    } else {
      setIsEditingGuides(true);
      setEditedPieceDataUrls({});
      setCommittedVerticalGuides([]);
      setCommittedHorizontalGuides([]);
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
      setCommittedVerticalGuides([]);
      setCommittedHorizontalGuides([]);
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
    setCommittedVerticalGuides([]);
    setCommittedHorizontalGuides([]);
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
      setCommittedVerticalGuides([]);
      setCommittedHorizontalGuides([]);
      setVerticalGuides((prev) => prev.filter((_, index) => index !== selectedGuide.index));
    } else {
      setIsEditingGuides(true);
      setEditedPieceDataUrls({});
      setCommittedVerticalGuides([]);
      setCommittedHorizontalGuides([]);
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
    setSelectedFileLabel("No file selected");
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
    setSliceUploads({});
    setDraftFreehandPoints([]);
    setDraftRectSelection(null);
    setIsDrawingFreehand(false);
    setCleanupPieceKey(null);
    setMode("rectangle");
  }

  function clearPrimaryImageOnly() {
    const shouldClear = window.confirm(confirmClearPrimaryText);
    if (!shouldClear) {
      return;
    }

    if (imageSrc?.startsWith("blob:")) {
      URL.revokeObjectURL(imageSrc);
    }

    setSavedPieces((prev) => [
      ...prev,
      ...outputPieces
        .filter((piece) => !prev.some((savedPiece) => savedPiece.key === piece.key))
        .map((piece) => ({
          ...piece,
          savedAt: Date.now(),
        })),
    ]);
    setImageSrc(null);
    setImageEl(null);
    setSelectedFileLabel("No file selected");
    setVerticalGuides([]);
    setHorizontalGuides([]);
    setCommittedVerticalGuides([]);
    setCommittedHorizontalGuides([]);
    setDragging(null);
    setSelectedGuide(null);
    setScale(100);
    setIsEditingGuides(false);
    setEditedPieceDataUrls({});
    setRemovedPieceKeys([]);
    setFreehandRegions([]);
    setRectRegions([]);
    setDraftFreehandPoints([]);
    setDraftRectSelection(null);
    setIsDrawingFreehand(false);
    setCleanupPieceKey(null);
    setMode("rectangle");
  }

  function clearCutImagesOnly() {
    const shouldClear = window.confirm(confirmClearCutImagesText);
    if (!shouldClear) {
      return;
    }

    setCommittedVerticalGuides([]);
    setCommittedHorizontalGuides([]);
    setIsEditingGuides(verticalGuides.length > 0 || horizontalGuides.length > 0);
    setEditedPieceDataUrls({});
    setRemovedPieceKeys([]);
    setFreehandRegions([]);
    setRectRegions([]);
    setSavedPieces([]);
    setSliceUploads({});
    setDraftFreehandPoints([]);
    setDraftRectSelection(null);
    setIsDrawingFreehand(false);
    setCleanupPieceKey(null);
  }

  function confirmClearWorkspace() {
    const shouldClear = window.confirm(confirmDeleteAllText);
    if (!shouldClear) {
      return;
    }

    clearWorkspace();
  }

  const cuttingToolPanel = imageEl ? (
    <div className="guide-generate-banner">
      <div className="mode-picker-header">
        <div>
          <strong>{t.chooseYourCuttingTool}</strong>
          <p>{t.chooseYourCuttingToolCopy}</p>
        </div>
        <span className="recommended-badge">{t.recommendedRectangle}</span>
      </div>
      <div className="mode-picker-grid">
        <button
          className={mode === "rectangle" ? "mode-choice-button mode-choice-button-active" : "mode-choice-button"}
          onClick={() => selectMode("rectangle")}
          title={t.rectangleCropCopy}
        >
          <strong>{t.rectangleCrop}</strong>
          <span>{t.rectangleCropCopy}</span>
        </button>
        <button
          className={mode === "freehand" ? "mode-choice-button mode-choice-button-active" : "mode-choice-button"}
          onClick={() => selectMode("freehand")}
          title={t.freehandDrawCopy}
        >
          <strong>{t.freehandDraw}</strong>
          <span>{t.freehandDrawCopy}</span>
        </button>
        <button
          className={mode === "guides" ? "mode-choice-button mode-choice-button-active" : "mode-choice-button"}
          onClick={() => selectMode("guides")}
          title={t.straightGuidesCopy}
        >
          <strong>{t.straightGuides}</strong>
          <span>{t.straightGuidesCopy}</span>
        </button>
      </div>

      {mode === "guides" ? (
        <>
          <div className="guide-action-grid">
            <button title={t.addVertical} onClick={() => addGuide("v")}>
              <Plus size={16} />
              {t.addVertical}
            </button>
            <button title={t.addHorizontal} onClick={() => addGuide("h")}>
              <Plus size={16} />
              {t.addHorizontal}
            </button>
            <button title={t.removeVertical} onClick={() => removeLastGuide("v")} disabled={verticalGuides.length === 0}>
              <Trash2 size={16} />
              {t.removeVertical}
            </button>
            <button title={t.removeHorizontal} onClick={() => removeLastGuide("h")} disabled={horizontalGuides.length === 0}>
              <Trash2 size={16} />
              {t.removeHorizontal}
            </button>
          </div>
          <button className="guide-generate-button" onClick={generateGuideSlices}>
            <Grid2x2Plus size={20} />
            {t.generateGuideSlices}
          </button>
          <p>{t.generateGuideSlicesCopy}</p>
        </>
      ) : null}
    </div>
  ) : null;

  function setPreset(columns: number, rows: number) {
    if (!imageEl) {
      return;
    }

    setIsEditingGuides(true);
    setEditedPieceDataUrls({});
    setCommittedVerticalGuides([]);
    setCommittedHorizontalGuides([]);
    setVerticalGuides(getDefaultGuides(imageEl.width, columns));
    setHorizontalGuides(getDefaultGuides(imageEl.height, rows));
    setSelectedGuide(null);
    setRemovedPieceKeys([]);
  }

  function applyCustomGuideGrid() {
    setPreset(Math.max(1, customGuideColumns), Math.max(1, customGuideRows));
  }

  function generateGuideSlices() {
    if (!imageEl) {
      return;
    }

    setCommittedVerticalGuides(sortUnique(verticalGuides, 1, imageEl.width - 1));
    setCommittedHorizontalGuides(sortUnique(horizontalGuides, 1, imageEl.height - 1));
    setEditedPieceDataUrls({});
    setRemovedPieceKeys((prev) => prev.filter((key) => !key.startsWith("grid-")));
    setIsEditingGuides(false);
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

  async function uploadPiece(piece: OutputPiece) {
    const uploadState = sliceUploads[piece.key];
    if (!uploadState || uploadState.uploading) {
      return;
    }

    setSliceUploads((prev) => ({
      ...prev,
      [piece.key]: {
        ...prev[piece.key],
        uploading: true,
        error: null,
      },
    }));

    try {
      const uploadedUrl = await uploadToCloudinary(uploadState.blob);
      setSliceUploads((prev) => ({
        ...prev,
        [piece.key]: {
          ...prev[piece.key],
          uploading: false,
          uploadedUrl,
          error: null,
        },
      }));
      showNotice(t.uploadCompleted, "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed";
      setSliceUploads((prev) => ({
        ...prev,
        [piece.key]: {
          ...prev[piece.key],
          uploading: false,
          error: message,
        },
      }));
      showNotice(message || t.uploadFailed, "error");
    }
  }

  async function uploadAllPieces() {
    for (const piece of visibleAndSavedPieces) {
      const state = sliceUploads[piece.key];
      if (state?.uploadedUrl || state?.uploading) {
        continue;
      }

      await uploadPiece(piece);
    }
  }

  async function copyUploadedLink(pieceKey: string) {
    const uploadedUrl = sliceUploads[pieceKey]?.uploadedUrl;
    if (!uploadedUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(uploadedUrl);
      showNotice(t.linkCopied, "success");
    } catch {
      showNotice(t.copyFailedManual, "error");
    }
  }

  async function copyPieceHtml(piece: OutputPiece, index: number) {
    const uploadedUrl = sliceUploads[piece.key]?.uploadedUrl;
    if (!uploadedUrl) {
      showNotice(t.noUploadedImagesYet, "error");
      return;
    }

    const html = `<img src="${uploadedUrl}" alt="${getPieceAltText(piece, index)}" />`;

    try {
      await navigator.clipboard.writeText(html);
      showNotice(t.htmlCopied, "success");
    } catch {
      showNotice(t.copyFailed, "error");
    }
  }

  async function copyAllLinks() {
    const uploadedUrls = visibleAndSavedPieces
      .map((piece) => sliceUploads[piece.key]?.uploadedUrl)
      .filter((url): url is string => Boolean(url));

    if (uploadedUrls.length === 0) {
      showNotice(t.noUploadedImagesYet, "error");
      return;
    }

    try {
      await navigator.clipboard.writeText(uploadedUrls.join("\n"));
      showNotice(t.allLinksCopied, "success");
    } catch {
      showNotice(t.copyFailed, "error");
    }
  }

  async function copyAllHtml() {
    const htmlLines = visibleAndSavedPieces
      .map((piece, index) => {
        const uploadedUrl = sliceUploads[piece.key]?.uploadedUrl;
        if (!uploadedUrl) {
          return null;
        }

        return `<img src="${uploadedUrl}" alt="${getPieceAltText(piece, index)}" />`;
      })
      .filter((line): line is string => Boolean(line));

    if (htmlLines.length === 0) {
      showNotice(t.noUploadedImagesYet, "error");
      return;
    }

    try {
      await navigator.clipboard.writeText(htmlLines.join("\n"));
      showNotice(t.allHtmlCopied, "success");
    } catch {
      showNotice(t.copyFailed, "error");
    }
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
    <main className={`app-shell locale-${locale}`} dir={locale === "he" ? "rtl" : "ltr"}>
      <button className="language-toggle" onClick={() => setLocale((prev) => (prev === "en" ? "he" : "en"))}>
        {t.language}
      </button>
      <section className="hero hero-product">
        <div className="hero-copy-block">
          <div className="hero-brand-row">
            <p className="eyebrow">Image Slicer Tool</p>
            <span className="hero-inline-badge">{t.builtFor}</span>
          </div>
          <h1>{t.heroTitle}</h1>
          <p className="hero-copy">{t.heroCopy}</p>
          {isEditingGuides && imageEl ? (
            <p className="editing-note">{t.editingNote}</p>
          ) : null}
        </div>
        <div className="hero-stats hero-stats-compact">
          <div className="stat-card">
            <span>{t.slices}</span>
            <strong>{outputPieces.length + savedPieces.length}</strong>
          </div>
          <div className="stat-card">
            <span>{t.guides}</span>
            <strong>{verticalGuides.length + horizontalGuides.length}</strong>
          </div>
          <div className="stat-card">
            <span>{t.zoom}</span>
            <strong>{scale}%</strong>
          </div>
        </div>
      </section>

      <section className="workspace">
        <aside className="panel control-panel">
          <div className="panel-section-header">
            <h2>{t.controls}</h2>
            <p>{t.controlsCopy}</p>
          </div>
          <div className="panel-block">
            <label className="field">
              <span>{t.uploadImage}</span>
              <input
                  ref={fileInputRef}
                  className="hidden-file-input"
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                />
                <button type="button" className="file-trigger-button" onClick={() => fileInputRef.current?.click()}>
                  {t.chooseImageFile}
                </button>
                <span className="file-selected-label">
                  {selectedFileLabel === "No file selected" ? t.noFileSelected : selectedFileLabel}
                </span>
              </label>
            <div className="panel-delete-actions">
              <button className="danger-button" onClick={clearPrimaryImageOnly} disabled={!imageEl && !imageSrc}>
                <Trash2 size={16} />
                {clearPrimaryImageText}
              </button>
              <button
                className="danger-button"
                onClick={clearCutImagesOnly}
                disabled={outputPieces.length === 0 && savedPieces.length === 0}
              >
                <Trash2 size={16} />
                {clearCutImagesText}
              </button>
              <button
                className="danger-button danger-button-strong"
                onClick={confirmClearWorkspace}
                disabled={!imageEl && outputPieces.length === 0 && savedPieces.length === 0}
              >
                <Trash2 size={16} />
                {deleteEverythingText}
              </button>
            </div>
          </div>

          <div className="panel-block">
            <label className="field">
              <span>{t.baseFileName}</span>
              <input value={fileName} onChange={(event) => setFileName(event.target.value || "image")} />
            </label>
          </div>

          <div className="panel-block">
            <span className="block-title">{t.quickPresets}</span>
            <div className="button-grid">
              <button onClick={() => setPreset(2, 2)} disabled={!imageEl || mode !== "guides"}>
                {t.twoByTwo}
              </button>
                <button onClick={() => setPreset(3, 3)} disabled={!imageEl || mode !== "guides"}>
                  {quickGridText.threeByThree}
                </button>
                <button onClick={() => setPreset(4, 4)} disabled={!imageEl || mode !== "guides"}>
                  {quickGridText.fourByFour}
                </button>
              </div>
              <div className="custom-grid-panel">
              <span className="custom-grid-title">{quickGridText.customGrid}</span>
              <div className="custom-grid-inputs">
                <label className="field">
                  <span>{t.width}</span>
                  <input
                    type="number"
                    min="1"
                    max="12"
                    value={customGuideColumns}
                    onChange={(event) => setCustomGuideColumns(Math.max(1, Number(event.target.value) || 1))}
                  />
                </label>
                <label className="field">
                  <span>{t.height}</span>
                  <input
                    type="number"
                    min="1"
                    max="12"
                    value={customGuideRows}
                    onChange={(event) => setCustomGuideRows(Math.max(1, Number(event.target.value) || 1))}
                  />
                </label>
              </div>
              <button onClick={applyCustomGuideGrid} disabled={!imageEl || mode !== "guides"}>
                {quickGridText.applyGrid}
              </button>
            </div>
          </div>

          {mode === "rectangle" ? (
            <div className="panel-block">
              <span className="block-title">{t.rectangleOutputSize}</span>
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
                <span>{t.width}</span>
                <input
                  type="number"
                  min="200"
                  step="50"
                  value={rectangleTargetWidth}
                  onChange={(event) => setRectangleTargetWidth(Math.max(200, Number(event.target.value) || 200))}
                />
              </label>
              <label className="field">
                <span>{t.height}</span>
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
            <span className="block-title">{t.guidesTitle}</span>
            <button
              className="danger-button"
              onClick={deleteSelectedGuide}
              disabled={!selectedGuide || mode !== "guides"}
            >
              <Trash2 size={16} />
              {t.deleteSelectedGuide}
            </button>
          </div>

          <div className="panel-block">
            <label className="field">
              <span>{t.previewZoom}: {scale}%</span>
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
            <div className="panel-subsection-title">
              <strong>{t.globalActions}</strong>
              <span>{t.globalActionsCopy}</span>
            </div>
            <label className="field">
              <span>{t.exportQuality}</span>
              <select value={exportScale} onChange={(event) => setExportScale(Number(event.target.value))}>
                <option value={1}>{t.standard1x}</option>
                <option value={2}>{t.enhanced2x}</option>
                <option value={3}>{t.enhanced3x}</option>
              </select>
            </label>
            <button
              className="primary-button"
              onClick={downloadAllPngs}
              disabled={outputPieces.length + savedPieces.length === 0 || isExportingZip}
            >
              <Download size={16} />
              {t.downloadAllPngs}
            </button>
            <button
              className="primary-button"
              onClick={uploadAllPieces}
              disabled={visibleAndSavedPieces.length === 0}
            >
              <Download size={16} />
              {t.uploadAllCloudinary}
            </button>
            <div className="bulk-action-grid">
              <button onClick={copyAllLinks} disabled={visibleAndSavedPieces.length === 0}>
                <Copy size={16} />
                {t.copyAllLinks}
              </button>
              <button onClick={copyAllHtml} disabled={visibleAndSavedPieces.length === 0}>
                <Copy size={16} />
                {t.copyAllHtml}
              </button>
            </div>
            <label className="auto-upload-toggle">
              <input
                type="checkbox"
                checked={autoUploadEnabled}
                onChange={(event) => setAutoUploadEnabled(event.target.checked)}
              />
              <span>{t.autoUpload}</span>
            </label>
            <button
              className="primary-button"
              onClick={downloadZip}
              disabled={outputPieces.length + savedPieces.length === 0 || isExportingZip}
            >
              <Download size={16} />
              {isExportingZip ? t.buildingZip : t.downloadZip}
            </button>
              <p className="hint">
                {mode === "guides"
                  ? t.guidesHint
                  : mode === "freehand"
                    ? t.freehandHint
                    : t.rectangleHint}
              </p>
            </div>
        </aside>

        <section className="main-panel">
          <div className="canvas-card preview-card">
            <div className="canvas-header">
              <div>
                <h2>{t.livePreview}</h2>
                <p>
                  {mode === "guides"
                    ? t.guidesPreviewCopy
                    : mode === "freehand"
                      ? t.freehandPreviewCopy
                      : t.rectanglePreviewCopy}
                </p>
              </div>
              <div className="legend">
                <span>
                  <Move size={14} />
                  {t.dragGuides}
                </span>
                <span>
                  <Scissors size={14} />
                  {t.freehandSelection}
                </span>
                <span>
                  <Grid2x2Plus size={14} />
                  {t.mixedOutput}
                </span>
              </div>
            </div>

            {imageSrc && imageEl ? (
              <div className="preview-stage preview-stage-elevated">
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
                        title={`${t.verticalGuideTitle} ${index + 1}`}
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
                        title={`${t.horizontalGuideTitle} ${index + 1}`}
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
              <div
                className={`empty-state empty-upload-state ${isDragActive ? "empty-upload-state-active" : ""}`}
                onClick={() => fileInputRef.current?.click()}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setIsDragActive(true);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDragActive(true);
                }}
                onDragLeave={(event) => {
                  event.preventDefault();
                  if (event.currentTarget === event.target) {
                    setIsDragActive(false);
                  }
                }}
                onDrop={handleDrop}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
              >
                <ImageIcon size={42} />
                <h3>{t.dropImageTitle}</h3>
                <p>{t.dropImageCopy}</p>
                <button
                  type="button"
                  className="empty-state-upload-button"
                  onClick={(event) => {
                    event.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                >
                  {t.chooseImageFile}
                </button>
              </div>
            )}
          </div>

          {imageEl && outputPieces.length > 0 ? (
            <div className="live-output-banner">
              <div className="live-output-copy">
                <strong>{t.outputPieces}</strong>
                <span>
                  {outputPieces.length} {t.pngReady}
                </span>
              </div>
              <div className="live-output-flow-grid">
                {[...outputPieces].reverse().map((piece, index) => (
                  <div key={`${piece.key}-live-${index}`} className="live-output-mini-card">
                    <img src={piece.dataUrl} alt={piece.label} />
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {visibleAndSavedPieces.length > 0 ? (
            <div className="floating-bulk-actions floating-bulk-actions-near-preview">
              <div className="floating-bulk-header">
                <strong>{t.globalActions}</strong>
                <span>{t.globalActionsCopy}</span>
              </div>
              <div className="floating-bulk-grid">
                <button
                  className="primary-button floating-action-button"
                  onClick={downloadAllPngs}
                  disabled={outputPieces.length + savedPieces.length === 0 || isExportingZip}
                >
                  <Download size={18} />
                  {t.downloadAllPngs}
                </button>
                <button
                  className="primary-button floating-action-button"
                  onClick={uploadAllPieces}
                  disabled={visibleAndSavedPieces.length === 0}
                >
                  <Download size={18} />
                  {t.uploadAllCloudinary}
                </button>
                <button className="floating-action-button" onClick={copyAllLinks} disabled={visibleAndSavedPieces.length === 0}>
                  <Copy size={18} />
                  {t.copyAllLinks}
                </button>
                <button className="floating-action-button" onClick={copyAllHtml} disabled={visibleAndSavedPieces.length === 0}>
                  <Copy size={18} />
                  {t.copyAllHtml}
                </button>
                <button
                  className="primary-button floating-action-button"
                  onClick={downloadZip}
                  disabled={outputPieces.length + savedPieces.length === 0 || isExportingZip}
                >
                  <Download size={18} />
                  {isExportingZip ? t.buildingZip : t.downloadZip}
                </button>
              </div>
              <label className="auto-upload-toggle floating-auto-upload-toggle">
                <input
                  type="checkbox"
                  checked={autoUploadEnabled}
                  onChange={(event) => setAutoUploadEnabled(event.target.checked)}
                />
                <span>{t.autoUpload}</span>
              </label>
            </div>
          ) : null}

          <div className="slices-card output-section-card">
            {appNotice ? (
              <div className={`app-notice app-notice-${appNotice?.tone ?? "info"}`}>{appNotice.text}</div>
            ) : null}
            {imageEl && outputPieces.length === 0 && savedPieces.length === 0 ? cuttingToolPanel : null}

            <div className="canvas-header">
              <div>
                <h2>{t.outputPieces}</h2>
                <p>
                  {isEditingGuides && imageEl && mode === "guides"
                    ? t.guideSlicesWaiting
                    : outputPieces.length > 0
                      ? `${outputPieces.length} ${t.pngReady}`
                      : t.slicesAppearLater}
                </p>
              </div>
            </div>

            {cleanupPiece ? (
              <div className="cleanup-editor">
                <div className="cleanup-header">
                  <div>
                    <strong>{t.cleanup} {cleanupPiece.label}</strong>
                    <p>{t.cleanupCopy}</p>
                  </div>
                  <div className="cleanup-actions">
                    <button onClick={undoCleanupAction} disabled={cleanupHistory.length === 0}>
                      {t.undoLastEdit}
                    </button>
                    <button onClick={resetCleanup}>{t.resetPiece}</button>
                    <button onClick={centerCleanupSubject}>{t.centerSubject}</button>
                    <button onClick={expandCleanupSubject}>{t.completeWithoutAi}</button>
                    <button onClick={() => setCleanupPieceKey(null)}>{t.cancel}</button>
                    <button className="primary-button cleanup-save-button" onClick={saveCleanup}>
                      {t.saveCleanup}
                    </button>
                  </div>
                </div>
                <div className="cleanup-tool-row">
                  <button
                    className={cleanupTool === "paint" ? "active-mode-button" : ""}
                    onClick={() => setCleanupTool("paint")}
                  >
                    {t.paintColor}
                  </button>
                  <button
                    className={cleanupTool === "complete" ? "active-mode-button" : ""}
                    onClick={() => setCleanupTool("complete")}
                  >
                    {t.completeSelectedArea}
                  </button>
                </div>
                <label className="field cleanup-field">
                  <span>{t.fillColor}</span>
                  <input
                    className="cleanup-color-input"
                    type="color"
                    value={cleanupFillColor}
                    onChange={(event) => setCleanupFillColor(event.target.value)}
                    disabled={cleanupTool !== "paint"}
                  />
                </label>
                <label className="field cleanup-field">
                  <span>{t.brushSize}: {cleanupBrushSize}px</span>
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
                    <h2>{t.savedPieces}</h2>
                    <p>{t.savedPiecesCopy}</p>
                  </div>
                </div>
                <div className="slice-grid">
                  {savedPieces.map((piece, index) => (
                    <article key={`${piece.key}-saved-${index}`} className="slice-tile saved-piece-tile output-card">
                      <div className="slice-preview">
                        <img src={piece.dataUrl} alt={piece.label} />
                      </div>
                      <div className="slice-meta slice-meta-stacked">
                        <div>
                          <strong>{piece.label}</strong>
                          <span className="slice-dimension-chip">
                            {t.savedPiece}
                          </span>
                        </div>
                        <span>
                          {piece.width} x {piece.height}px
                        </span>
                      </div>
                      <label className="field piece-name-field">
                        <span>{t.imageName}</span>
                        <input
                          value={pieceNames[piece.key] ?? ""}
                          onChange={(event) => updatePieceName(piece.key, event.target.value)}
                          placeholder={getPieceName(piece, index)}
                        />
                      </label>
                      <button className="primary-inline-button" onClick={() => downloadPiece(piece, index)}>
                        <Download size={14} />
                        {t.download}
                      </button>
                      <div className="piece-action-grid">
                        <button
                          onClick={() => uploadPiece(piece)}
                          disabled={sliceUploads[piece.key]?.uploading}
                        >
                          <Download size={14} />
                          {sliceUploads[piece.key]?.uploading ? "Uploading..." : t.upload}
                        </button>
                        <button
                          onClick={() => copyUploadedLink(piece.key)}
                          disabled={!sliceUploads[piece.key]?.uploadedUrl}
                        >
                          <Copy size={14} />
                          {t.copyLink}
                        </button>
                        <button
                          onClick={() => copyPieceHtml(piece, index)}
                          disabled={!sliceUploads[piece.key]?.uploadedUrl}
                        >
                          <Copy size={14} />
                          {t.copyHtml}
                        </button>
                      </div>
                      {sliceUploads[piece.key]?.uploadedUrl ? (
                        <p className="slice-upload-link">{sliceUploads[piece.key]?.uploadedUrl}</p>
                      ) : null}
                      {sliceUploads[piece.key]?.error ? (
                        <p className="slice-upload-status">{sliceUploads[piece.key]?.error}</p>
                      ) : null}
                      <button className="slice-delete-button" onClick={() => removeSavedPiece(piece.key)}>
                        <Trash2 size={14} />
                        {t.removeSaved}
                      </button>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="slice-grid">
              {(!(mode === "guides" && isEditingGuides)) &&
                imageEl &&
                outputPieces.map((piece, index) => (
                  <article key={`${piece.key}-${index}`} className="slice-tile output-card">
                    <div className="slice-preview">
                      <img src={piece.dataUrl} alt={`${piece.label} ${index + 1}`} />
                    </div>
                    <div className="slice-meta slice-meta-stacked">
                      <div>
                        <strong>{piece.label}</strong>
                        <span className="slice-dimension-chip">{t.readyToExport}</span>
                      </div>
                      <span>
                        {piece.width} x {piece.height}px
                      </span>
                    </div>
                    <label className="field piece-name-field">
                      <span>{t.imageName}</span>
                      <input
                        value={pieceNames[piece.key] ?? ""}
                        onChange={(event) => updatePieceName(piece.key, event.target.value)}
                        placeholder={getPieceName(piece, index)}
                      />
                    </label>
                    <button className="primary-inline-button" onClick={() => downloadPiece(piece, index)}>
                      <Download size={14} />
                      {t.download}
                    </button>
                    <div className="piece-action-grid">
                      <button
                        onClick={() => uploadPiece(piece)}
                        disabled={sliceUploads[piece.key]?.uploading}
                      >
                        <Download size={14} />
                        {sliceUploads[piece.key]?.uploading ? "Uploading..." : t.upload}
                      </button>
                      <button
                        onClick={() => copyUploadedLink(piece.key)}
                        disabled={!sliceUploads[piece.key]?.uploadedUrl}
                      >
                        <Copy size={14} />
                        {t.copyLink}
                      </button>
                      <button
                        onClick={() => copyPieceHtml(piece, index)}
                        disabled={!sliceUploads[piece.key]?.uploadedUrl}
                      >
                        <Copy size={14} />
                        {t.copyHtml}
                      </button>
                    </div>
                    {sliceUploads[piece.key]?.uploadedUrl ? (
                      <p className="slice-upload-link">{sliceUploads[piece.key]?.uploadedUrl}</p>
                    ) : null}
                    {sliceUploads[piece.key]?.error ? (
                      <p className="slice-upload-status">{sliceUploads[piece.key]?.error}</p>
                    ) : null}
                    <button onClick={() => keepPiece(piece)} disabled={savedPieces.some((savedPiece) => savedPiece.key === piece.key)}>
                      <Plus size={14} />
                      {savedPieces.some((savedPiece) => savedPiece.key === piece.key) ? t.saved : t.keepPiece}
                    </button>
                    <button onClick={() => setCleanupPieceKey(piece.key)}>
                      <Scissors size={14} />
                      {t.cleanup}
                    </button>
                    <button className="slice-delete-button" onClick={() => removePieceByKey(piece.key)}>
                      <Trash2 size={14} />
                      {t.removePiece}
                    </button>
                  </article>
                ))}
              {(!(mode === "guides" && isEditingGuides)) && imageEl && outputPieces.length === 0 ? (
                <div className="slice-placeholder">
                  {mode === "guides"
                    ? t.addGuidePlaceholder
                    : t.freehandPlaceholder}
                </div>
              ) : null}
              {isEditingGuides && imageEl && mode === "guides" ? (
                <div className="slice-placeholder">
                  {t.guidesWaiting}
                </div>
              ) : null}
            </div>
            {imageEl && (outputPieces.length > 0 || savedPieces.length > 0) ? (
              <div className="cutting-tool-panel-bottom">
                {cuttingToolPanel}
              </div>
            ) : null}
          </div>
        </section>
      </section>
    </main>
  );
}
