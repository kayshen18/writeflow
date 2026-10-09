import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type {
  ChangeEvent,
  FocusEvent,
} from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router";
import {
  Group,
  Panel,
  Separator,
  usePanelRef,
} from "react-resizable-panels";
import {
  Canvas as FabricCanvas,
  Circle,
  FabricImage,
  PencilBrush,
  Rect,
  Triangle,
} from "fabric";
import {
  addWorkToProject,
  createMyWork,
  deleteMyWork,
  deleteUploadedImages,
  getMyWork,
  getSavedUser,
  updateMyWork,
  uploadWorkImages,
  getMyDraft,
  reloadMyDraft,
  saveMyDraft,
  submitChangeRequest,
  type ProjectItemRole,
} from "../lib/api";
import PublishWorkModal from "../components/publish/PublishWorkModal";
import CollaboratorPanel from "../components/collaboration/CollaboratorPanel";
import CollaboratorPresence from "../components/collaboration/CollaboratorPresence";
import ReviewQueuePanel from "../components/collaboration/ReviewQueuePanel";
import ReviewQueueButton from "../components/collaboration/ReviewQueueButton";
import MySubmissionsPanel from "../components/collaboration/MySubmissionsPanel";
import NotificationBell from "../components/notifications/NotificationBell";

type DrawingTool =
  | "select"
  | "brush"
  | "pencil"
  | "highlighter"
  | "eraser"
  | "area";

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 800;

function hexToRgba(hex: string, alpha: number) {
  const normalized = hex.replace("#", "");

  const fullHex =
    normalized.length === 3
      ? normalized
          .split("")
          .map((character) => character + character)
          .join("")
      : normalized;

  const red = Number.parseInt(fullHex.slice(0, 2), 16);
  const green = Number.parseInt(fullHex.slice(2, 4), 16);
  const blue = Number.parseInt(fullHex.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function collectImagePathsFromDrawing(content: unknown) {
  const paths = new Set<string>();

  try {
    const drawingData =
      typeof content === "string"
        ? JSON.parse(content)
        : content;

    function visit(value: unknown) {
      if (!value || typeof value !== "object") {
        return;
      }

      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }

      const record = value as Record<string, unknown>;

      if (typeof record.storagePath === "string") {
        paths.add(record.storagePath);
      }

      Object.values(record).forEach(visit);
    }

    visit(drawingData);
  } catch (error) {
    console.error("Unable to inspect drawing images:", error);
  }

  return [...paths];
}

function ImageEditorPage() {
  const { workId } = useParams();
  const [searchParams] = useSearchParams();

  const sourceProjectId =
    searchParams.get("projectId");

  const requestedProjectRole =
    searchParams.get("projectRole");

  const allowedProjectRoles: ProjectItemRole[] = [
    "chapter",
    "character",
    "scene",
    "cover",
    "inspiration",
    "other",
  ];

  const sourceProjectRole: ProjectItemRole =
    allowedProjectRoles.includes(
      requestedProjectRole as ProjectItemRole,
    )
      ? (requestedProjectRole as ProjectItemRole)
      : "scene";
  const navigate = useNavigate();

  const htmlCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fabricCanvasRef = useRef<FabricCanvas | null>(null);
  const toolsPanelRef = usePanelRef();

  const newlyUploadedPathsRef = useRef<Set<string>>(
    new Set(),
  );

  const pendingDeletedPathsRef = useRef<Set<string>>(
    new Set(),
  );

  const [canvasReady, setCanvasReady] = useState(false);
  const [title, setTitle] = useState("Untitled Artwork");

  const [activeTool, setActiveTool] =
    useState<DrawingTool>("select");

  const [backgroundColor, setBackgroundColor] =
    useState("#ffffff");

  const [brushColor, setBrushColor] = useState("#111827");
  const [brushSize, setBrushSize] = useState(8);
  const [areaColor, setAreaColor] = useState("#f59e0b");
  const [shapeColor, setShapeColor] = useState("#3b82f6");

  const [isLoading, setIsLoading] = useState(Boolean(workId));
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isToolsCollapsed, setIsToolsCollapsed] =
    useState(false);

  const [message, setMessage] = useState("");

  const [
    isPublishModalOpen,
    setIsPublishModalOpen,
  ] = useState(false);

  const [
    isCollaboratorPanelOpen,
    setIsCollaboratorPanelOpen,
  ] = useState(false);

  const [
    isReviewQueueOpen,
    setIsReviewQueueOpen,
  ] = useState(false);

  const [
    isMySubmissionsOpen,
    setIsMySubmissionsOpen,
  ] = useState(false);

  const [isOwner, setIsOwner] = useState(false);
  const [canEdit, setCanEdit] = useState(true);

  const [
    accessRole,
    setAccessRole,
  ] = useState<
    "owner" | "editor" | "viewer"
  >("viewer");

  const [
    currentVersion,
    setCurrentVersion,
  ] = useState(1);

  const [
    isDraftMode,
    setIsDraftMode,
  ] = useState(false);

  const [
    isSubmittingChanges,
    setIsSubmittingChanges,
  ] = useState(false);

  const showMessage = useCallback((text: string) => {
    setMessage(text);

    window.setTimeout(() => {
      setMessage("");
    }, 3000);
  }, []);

  const removeStorageFiles = useCallback(
    async (paths: string[]) => {
      const uniquePaths = [...new Set(paths)].filter(Boolean);

      if (uniquePaths.length === 0) {
        return;
      }

      try {
        await deleteUploadedImages(uniquePaths);
      } catch (error) {
        console.error("Unable to delete images:", error);
      }
    },
    [],
  );

  useEffect(() => {
    if (!htmlCanvasRef.current) {
      return;
    }

    const canvas = new FabricCanvas(htmlCanvasRef.current, {
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      backgroundColor: "#ffffff",
      preserveObjectStacking: true,
      selection: true,
    });

    fabricCanvasRef.current = canvas;
    setCanvasReady(true);

    return () => {
      fabricCanvasRef.current = null;
      setCanvasReady(false);
      void canvas.dispose();
    };
  }, []);

  useEffect(() => {
    if (!canvasReady) {
      return;
    }

    const canvas = fabricCanvasRef.current!;

    if (!canvas) {
      return;
    }

    async function loadDrawing() {
      setIsLoading(true);
      setMessage("");

      if (!workId) {
        setAccessRole("owner");
        setIsOwner(false);
        setCanEdit(true);
        setCurrentVersion(1);
        setIsDraftMode(false);
        canvas.clear();
        canvas.backgroundColor = "#ffffff";
        canvas.requestRenderAll();

        setTitle("Untitled Artwork");
        setBackgroundColor("#ffffff");
        setIsLoading(false);
        return;
      }

      if (!getSavedUser()) {
        navigate("/login", { replace: true });
        return;
      }

      try {
        const result = await getMyWork(workId);
        const work = result.work;

        if (work.work_type !== "drawing") {
          showMessage("This work is not a drawing.");
          return;
        }

        const drawingData =
          typeof work.content_json === "string"
            ? JSON.parse(work.content_json)
            : work.content_json;

        canvas.clear();
        await canvas.loadFromJSON(drawingData);
        canvas.requestRenderAll();

        setAccessRole(work.access_role);
        setIsOwner(work.access_role === "owner");
        setCanEdit(work.access_role === "owner");
        setCurrentVersion(work.current_version);
        setIsDraftMode(false);

        setTitle(work.title || "Untitled Artwork");

        if (typeof canvas.backgroundColor === "string") {
          setBackgroundColor(canvas.backgroundColor);
        }
      } catch (error) {
        console.error(error);

        const errorMessage =
          error instanceof Error
            ? error.message
            : "Artwork could not be loaded.";

        if (
          errorMessage.includes("logged in") ||
          errorMessage.includes("session")
        ) {
          navigate("/login", { replace: true });
          return;
        }

        showMessage(errorMessage);
      } finally {
        setIsLoading(false);
      }
    }

    void loadDrawing();
  }, [
    canvasReady,
    navigate,
    showMessage,
    workId,
  ]);

  useEffect(() => {
    const canvas = fabricCanvasRef.current!;

    if (!canvas || isLoading) {
      return;
    }

    canvas.backgroundColor = backgroundColor;
    canvas.requestRenderAll();
  }, [backgroundColor, isLoading]);

  useEffect(() => {
    const canvas = fabricCanvasRef.current!;

    if (!canvas) {
      return;
    }

    const isDrawingTool =
      canEdit &&
      (
        activeTool === "brush" ||
        activeTool === "pencil" ||
        activeTool === "highlighter" ||
        activeTool === "eraser"
      );

    const isSelectionTool =
      canEdit &&
      activeTool === "select";

    canvas.isDrawingMode = isDrawingTool;
    canvas.selection = isSelectionTool;

    canvas.getObjects().forEach((object) => {
      const isEraserPath =
        object.globalCompositeOperation ===
        "destination-out";

      object.set({
        selectable: isSelectionTool && !isEraserPath,
        evented: isSelectionTool && !isEraserPath,
      });
    });

    if (isDrawingTool) {
      const drawingBrush = new PencilBrush(canvas);

      if (activeTool === "brush") {
        drawingBrush.color = brushColor;
        drawingBrush.width = brushSize;
      }

      if (activeTool === "pencil") {
        drawingBrush.color = brushColor;
        drawingBrush.width = Math.max(1, brushSize * 0.45);
      }

      if (activeTool === "highlighter") {
        drawingBrush.color = hexToRgba(brushColor, 0.3);
        drawingBrush.width = brushSize * 4;
      }

      if (activeTool === "eraser") {
        drawingBrush.color = "#000000";
        drawingBrush.width = brushSize * 2;
      }

      canvas.freeDrawingBrush = drawingBrush;
    }

    function handlePathCreated(event: any) {
      if (activeTool !== "eraser" || !event.path) {
        return;
      }

      event.path.set({
        globalCompositeOperation: "destination-out",
        selectable: false,
        evented: false,
      });

      canvas.requestRenderAll();
    }

    canvas.on("path:created", handlePathCreated);

    return () => {
      canvas.off("path:created", handlePathCreated);
    };
  }, [activeTool, brushColor, brushSize, canEdit]);

  useEffect(() => {
    const canvas = fabricCanvasRef.current!;

    if (
      !canvas ||
      activeTool !== "area" ||
      !canEdit
    ) {
      return;
    }

    canvas.isDrawingMode = false;
    canvas.selection = false;

    let startX = 0;
    let startY = 0;
    let selectionRectangle: Rect | null = null;
    let isSelecting = false;

    function getPointer(event: any) {
      return event.scenePoint || canvas.getScenePoint(event.e);
    }

    function handleMouseDown(event: any) {
      const pointer = getPointer(event);

      startX = pointer.x;
      startY = pointer.y;
      isSelecting = true;

      selectionRectangle = new Rect({
        left: startX,
        top: startY,
        width: 0,
        height: 0,
        fill: hexToRgba(areaColor, 0.35),
        stroke: areaColor,
        strokeWidth: 1,
        strokeDashArray: [8, 6],
        selectable: false,
        evented: false,
      });

      canvas.add(selectionRectangle);
    }

    function handleMouseMove(event: any) {
      if (!isSelecting || !selectionRectangle) {
        return;
      }

      const pointer = getPointer(event);

      selectionRectangle.set({
        left: Math.min(startX, pointer.x),
        top: Math.min(startY, pointer.y),
        width: Math.abs(pointer.x - startX),
        height: Math.abs(pointer.y - startY),
      });

      selectionRectangle.setCoords();
      canvas.requestRenderAll();
    }

    function handleMouseUp() {
      if (!isSelecting || !selectionRectangle) {
        return;
      }

      isSelecting = false;

      if (
        selectionRectangle.width < 4 ||
        selectionRectangle.height < 4
      ) {
        canvas.remove(selectionRectangle);
      } else {
        selectionRectangle.set({
          stroke: undefined,
          strokeDashArray: undefined,
          selectable: true,
          evented: true,
        });

        selectionRectangle.setCoords();
        canvas.setActiveObject(selectionRectangle);
      }

      selectionRectangle = null;
      canvas.requestRenderAll();
      setActiveTool("select");
    }

    canvas.on("mouse:down", handleMouseDown);
    canvas.on("mouse:move", handleMouseMove);
    canvas.on("mouse:up", handleMouseUp);

    return () => {
      canvas.off("mouse:down", handleMouseDown);
      canvas.off("mouse:move", handleMouseMove);
      canvas.off("mouse:up", handleMouseUp);
    };
  }, [activeTool, areaColor, canEdit]);

  useEffect(() => {
    return () => {
      if (
        !workId &&
        newlyUploadedPathsRef.current.size > 0
      ) {
        void removeStorageFiles([
          ...newlyUploadedPathsRef.current,
        ]);
      }
    };
  }, [removeStorageFiles, workId]);

  function handleTitleFocus(
    event: FocusEvent<HTMLInputElement>,
  ) {
    event.currentTarget.select();
  }

  function toggleToolsPanel() {
    const panel = toolsPanelRef.current;

    if (!panel) {
      return;
    }

    if (panel.isCollapsed()) {
      panel.expand();
      setIsToolsCollapsed(false);
    } else {
      panel.collapse();
      setIsToolsCollapsed(true);
    }
  }

  function addRectangle() {
    const canvas = fabricCanvasRef.current;

    if (!canvas) {
      return;
    }

    const rectangle = new Rect({
      left: 180,
      top: 140,
      width: 240,
      height: 160,
      rx: 8,
      ry: 8,
      fill: shapeColor,
    });

    canvas.add(rectangle);
    canvas.setActiveObject(rectangle);
    canvas.requestRenderAll();
    setActiveTool("select");
  }

  function addCircle() {
    const canvas = fabricCanvasRef.current;

    if (!canvas) {
      return;
    }

    const circle = new Circle({
      left: 220,
      top: 160,
      radius: 90,
      fill: shapeColor,
    });

    canvas.add(circle);
    canvas.setActiveObject(circle);
    canvas.requestRenderAll();
    setActiveTool("select");
  }

  function addTriangle() {
    const canvas = fabricCanvasRef.current;

    if (!canvas) {
      return;
    }

    const triangle = new Triangle({
      left: 220,
      top: 150,
      width: 220,
      height: 190,
      fill: shapeColor,
    });

    canvas.add(triangle);
    canvas.setActiveObject(triangle);
    canvas.requestRenderAll();
    setActiveTool("select");
  }

  function applyColorToSelection() {
    const canvas = fabricCanvasRef.current;

    if (!canvas) {
      return;
    }

    const selectedObjects = canvas.getActiveObjects();

    if (selectedObjects.length === 0) {
      showMessage("Select a shape or drawing first.");
      return;
    }

    selectedObjects.forEach((object) => {
      if (object.type === "image") {
        return;
      }

      if (object.type === "path") {
        object.set({ stroke: shapeColor });
      } else {
        object.set({ fill: shapeColor });
      }

      object.setCoords();
    });

    canvas.requestRenderAll();
  }

  function deleteSelectedObjects() {
    const canvas = fabricCanvasRef.current;

    if (!canvas) {
      return;
    }

    const selectedObjects = canvas.getActiveObjects();

    if (selectedObjects.length === 0) {
      showMessage("Select an object first.");
      return;
    }

    selectedObjects.forEach((object) => {
      const storagePath = (
        object as unknown as {
          storagePath?: string;
        }
      ).storagePath;

      if (storagePath && !isDraftMode) {
        pendingDeletedPathsRef.current.add(storagePath);
      }

      canvas.remove(object);
    });

    canvas.discardActiveObject();
    canvas.requestRenderAll();
  }

  function bringSelectionForward() {
    const canvas = fabricCanvasRef.current;

    if (!canvas) {
      return;
    }

    const object = canvas.getActiveObject();

    if (!object) {
      showMessage("Select an object first.");
      return;
    }

    canvas.bringObjectForward(object);
    canvas.requestRenderAll();
  }

  function sendSelectionBackward() {
    const canvas = fabricCanvasRef.current;

    if (!canvas) {
      return;
    }

    const object = canvas.getActiveObject();

    if (!object) {
      showMessage("Select an object first.");
      return;
    }

    canvas.sendObjectBackwards(object);
    canvas.requestRenderAll();
  }

  async function handleDraftModeToggle() {
    if (
      !workId ||
      accessRole !== "editor"
    ) {
      return;
    }

    if (isDraftMode) {
      const confirmed = window.confirm(
        "Return to read-only mode? Any unsaved draft changes will be lost.",
      );

      if (!confirmed) {
        return;
      }

      window.location.reload();
      return;
    }

    const canvas = fabricCanvasRef.current;

    if (!canvas) {
      return;
    }

    try {
      setIsLoading(true);
      setMessage("");

      const result = await getMyDraft(workId);
      const draft = result.draft;

      setCurrentVersion(
        draft?.base_version ??
          result.currentVersion,
      );

      if (draft) {
        const drawingData =
          typeof draft.draft_content_json ===
          "string"
            ? JSON.parse(
                draft.draft_content_json,
              )
            : draft.draft_content_json;

        canvas.clear();

        await canvas.loadFromJSON(drawingData);

        canvas.requestRenderAll();

        setTitle(
          draft.draft_title ||
            "Untitled Artwork",
        );

        if (
          typeof canvas.backgroundColor ===
          "string"
        ) {
          setBackgroundColor(
            canvas.backgroundColor,
          );
        }
      }

      pendingDeletedPathsRef.current.clear();
      newlyUploadedPathsRef.current.clear();

      setIsDraftMode(true);
      setCanEdit(true);

      showMessage(
        draft
          ? "Private artwork draft loaded. Your changes are visible only to you until submitted."
          : "Draft Mode is active. Your changes are private until submitted.",
      );
    } catch (error) {
      showMessage(
        error instanceof Error
          ? error.message
          : "Unable to start Draft Mode.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function handleReloadLatestOfficialVersion() {
    if (
      !workId ||
      accessRole !== "editor" ||
      !isDraftMode
    ) {
      return;
    }

    const confirmed = window.confirm(
      "Reload the latest official version? Your current private artwork draft will be replaced and cannot be restored.",
    );

    if (!confirmed) {
      return;
    }

    const canvas = fabricCanvasRef.current;

    if (!canvas) {
      return;
    }

    try {
      setIsLoading(true);
      setMessage("");

      const result = await reloadMyDraft(workId);

      const drawingData =
        typeof result.draft.contentJson === "string"
          ? JSON.parse(result.draft.contentJson)
          : result.draft.contentJson;

      canvas.clear();

      await canvas.loadFromJSON(drawingData);

      canvas.requestRenderAll();

      setTitle(
        result.draft.title || "Untitled Artwork",
      );

      setCurrentVersion(result.draft.baseVersion);

      if (typeof canvas.backgroundColor === "string") {
        setBackgroundColor(canvas.backgroundColor);
      }

      pendingDeletedPathsRef.current.clear();
      newlyUploadedPathsRef.current.clear();

      showMessage(
        `Latest official version loaded. You are now editing Draft Mode based on Version ${result.draft.baseVersion}.`,
      );
    } catch (error) {
      showMessage(
        error instanceof Error
          ? error.message
          : "Unable to reload the latest official version.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSubmitChanges() {
    if (
      !workId ||
      !isDraftMode ||
      isSubmittingChanges
    ) {
      return;
    }

    const canvas = fabricCanvasRef.current;

    if (!canvas) {
      return;
    }

    try {
      setIsSubmittingChanges(true);
      setMessage("");

      canvas.discardActiveObject();
      canvas.requestRenderAll();

      const drawingData =
        canvas.toDatalessJSON([
          "storagePath",
        ]);

      const artworkTitle =
        title.trim() || "Untitled Artwork";

      await saveMyDraft(workId, {
        title: artworkTitle,
        contentJson: drawingData,
        baseVersion: currentVersion,
      });

      await submitChangeRequest(workId);

      showMessage(
        "Changes submitted for owner review.",
      );

      window.setTimeout(() => {
        window.location.reload();
      }, 900);
    } catch (error) {
      showMessage(
        error instanceof Error
          ? error.message
          : "Unable to submit changes.",
      );
    } finally {
      setIsSubmittingChanges(false);
    }
  }

  async function handleImageUpload(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    if (!canEdit) {
      return;
    }

    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      showMessage("Please select an image file.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      showMessage("Images must be smaller than 10 MB.");
      return;
    }

    const canvas = fabricCanvasRef.current;

    if (!canvas) {
      return;
    }

    if (!getSavedUser()) {
      navigate("/login", { replace: true });
      return;
    }

    setIsUploading(true);

    try {
      const result = await uploadWorkImages([file]);
      const uploadedImage = result.images[0];

      if (!uploadedImage) {
        throw new Error("The server did not return an uploaded image.");
      }

      newlyUploadedPathsRef.current.add(uploadedImage.filePath);

      const image = await FabricImage.fromURL(
        uploadedImage.url,
        {
          crossOrigin: "anonymous",
        },
      );

      const imageWidth = image.width || 1;
      const imageHeight = image.height || 1;

      const scale = Math.min(
        600 / imageWidth,
        500 / imageHeight,
        1,
      );

      image.set({
        left: 180,
        top: 130,
      });

      image.scale(scale);

      (
        image as unknown as {
          storagePath: string;
        }
      ).storagePath = uploadedImage.filePath;

      canvas.add(image);
      canvas.setActiveObject(image);
      canvas.requestRenderAll();

      setActiveTool("select");
      showMessage("Image added.");
    } catch (error) {
      console.error(error);

      showMessage(
        error instanceof Error
          ? `Image upload failed: ${error.message}`
          : "Image upload failed.",
      );
    } finally {
      setIsUploading(false);
    }
  }

  async function saveArtwork() {
    const canvas = fabricCanvasRef.current;

    if (!canvas || isSaving) {
      return;
    }

    if (!getSavedUser()) {
      navigate("/login", { replace: true });
      return;
    }

    setIsSaving(true);
    setMessage("");

    try {
      canvas.discardActiveObject();
      canvas.requestRenderAll();

      const drawingData = canvas.toDatalessJSON([
        "storagePath",
      ]);

      const artworkTitle =
        title.trim() || "Untitled Artwork";

      if (workId && isDraftMode) {
        await saveMyDraft(workId, {
          title: artworkTitle,
          contentJson: drawingData,
          baseVersion: currentVersion,
        });

        pendingDeletedPathsRef.current.clear();
        newlyUploadedPathsRef.current.clear();

        showMessage("Private artwork draft saved.");
        return;
      }

      if (workId) {
        await updateMyWork(
          workId,
          artworkTitle,
          drawingData,
        );

        await removeStorageFiles([
          ...pendingDeletedPathsRef.current,
        ]);

        pendingDeletedPathsRef.current.clear();
        newlyUploadedPathsRef.current.clear();

        showMessage("Artwork saved.");
        return;
      }

      const result = await createMyWork(
        artworkTitle,
        "drawing",
        drawingData,
      );

      if (sourceProjectId) {
        try {
          await addWorkToProject(
            sourceProjectId,
            result.work.id,
            sourceProjectRole,
          );
        } catch (projectError) {
          const projectMessage =
            projectError instanceof Error
              ? projectError.message
              : "Unable to add the artwork to the project.";

          window.alert(
            `The artwork was saved, but it could not be added to the project: ${projectMessage}`,
          );
        }
      }

      await removeStorageFiles([
        ...pendingDeletedPathsRef.current,
      ]);

      newlyUploadedPathsRef.current.clear();
      pendingDeletedPathsRef.current.clear();

      showMessage("Artwork saved.");

      const projectQuery = sourceProjectId
        ? `?projectId=${encodeURIComponent(
            sourceProjectId,
          )}`
        : "";

      navigate(
        `/image/${result.work.id}${projectQuery}`,
        {
          replace: true,
        },
      );
    } catch (error) {
      console.error(error);

      showMessage(
        error instanceof Error
          ? `Artwork could not be saved: ${error.message}`
          : "Artwork could not be saved.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  function downloadPng() {
    const canvas = fabricCanvasRef.current;

    if (!canvas) {
      return;
    }

    canvas.discardActiveObject();
    canvas.requestRenderAll();

    const imageUrl = canvas.toDataURL({
      format: "png",
      multiplier: 1,
    });

    const link = document.createElement("a");

    link.href = imageUrl;
    link.download = `${
      title.trim() || "untitled-artwork"
    }.png`;

    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function createNewArtwork() {
    if (
      !workId &&
      newlyUploadedPathsRef.current.size > 0
    ) {
      await removeStorageFiles([
        ...newlyUploadedPathsRef.current,
      ]);
    }

    newlyUploadedPathsRef.current.clear();
    pendingDeletedPathsRef.current.clear();

    if (workId) {
      navigate("/image");
      return;
    }

    const canvas = fabricCanvasRef.current;

    if (!canvas) {
      return;
    }

    canvas.clear();
    canvas.backgroundColor = "#ffffff";
    canvas.requestRenderAll();

    setTitle("Untitled Artwork");
    setBackgroundColor("#ffffff");
    setActiveTool("select");
  }

  async function deleteArtwork() {
    if (!workId || isDeleting) {
      return;
    }

    const confirmed = window.confirm(
      "Delete this artwork permanently?",
    );

    if (!confirmed) {
      return;
    }

    setIsDeleting(true);

    try {
      const result = await getMyWork(workId);

      const imagePaths = collectImagePathsFromDrawing(
        result.work.content_json,
      );

      await deleteMyWork(workId);

      await removeStorageFiles([
        ...imagePaths,
        ...newlyUploadedPathsRef.current,
        ...pendingDeletedPathsRef.current,
      ]);

      newlyUploadedPathsRef.current.clear();
      pendingDeletedPathsRef.current.clear();

      navigate("/works");
    } catch (error) {
      console.error(error);

      showMessage(
        error instanceof Error
          ? `Artwork could not be deleted: ${error.message}`
          : "Artwork could not be deleted.",
      );
    } finally {
      setIsDeleting(false);
    }
  }

  function getToolButtonClass(tool: DrawingTool) {
    const common =
      "rounded-xl border px-3 py-2 text-left text-sm font-medium transition";

    return activeTool === tool
      ? `${common} border-[var(--wf-tool)] bg-[var(--wf-tool)] text-[var(--wf-tool-text)]`
      : `${common} border-[var(--wf-neutral-200)] bg-[var(--wf-surface)] text-[var(--wf-neutral-700)] hover:border-[var(--wf-primary-300)] hover:bg-[var(--wf-primary-50)]`;
  }

  return (
    <div className="flex min-h-screen flex-col bg-[var(--wf-surface)]">
      <header className="flex min-h-20 flex-wrap items-center gap-3 border-b border-[var(--wf-nav)] bg-[var(--wf-nav)] px-5 py-3 shadow-sm">
        <Link
          to="/"
          className="font-kranky shrink-0 text-4xl text-[var(--wf-nav-text)] transition hover:text-[var(--wf-save-hover)]"
        >
          WriteFlow
        </Link>

        {sourceProjectId && (
          <Link
            to={`/projects/${sourceProjectId}`}
            className="wf-editor-action"
          >
            Back to Project
          </Link>
        )}

        <input
          value={title}
          readOnly={!canEdit}
          onChange={(event) => {
            if (canEdit) {
              setTitle(event.target.value);
            }
          }}
          onFocus={handleTitleFocus}
          aria-label="Artwork title"
          className="h-11 min-w-52 flex-1 rounded-xl border border-[var(--wf-neutral-200)] bg-[var(--wf-neutral-50)] px-4 py-2 text-lg font-semibold text-[var(--wf-neutral-900)] outline-none transition focus:border-[var(--wf-primary-500)] focus:bg-[var(--wf-surface)] read-only:cursor-not-allowed read-only:opacity-60"
        />

        {workId && (
          <CollaboratorPresence workId={workId} />
        )}

        <NotificationBell />

        <button
          type="button"
          onClick={toggleToolsPanel}
          disabled={!canEdit}
          className="wf-editor-action"
        >
          {isToolsCollapsed ? "Show Tools" : "Hide Tools"}
        </button>

        <Link
          to="/works"
          className="wf-editor-action"
        >
          My Works
        </Link>

        {workId && accessRole === "editor" && (
          <button
            type="button"
            onClick={() =>
              void handleDraftModeToggle()
            }
            disabled={
              isSaving ||
              isSubmittingChanges ||
              isUploading
            }
            className={[
              "inline-flex h-11 items-center rounded-full px-4 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-60",
              isDraftMode
                ? "bg-[var(--wf-warning-100)] text-[var(--wf-warning-800)] hover:bg-[var(--wf-warning-200)]"
                : "bg-[var(--wf-neutral-100)] text-[var(--wf-neutral-700)] hover:bg-[var(--wf-neutral-200)]",
            ].join(" ")}
          >
            {isDraftMode
              ? "Draft Mode"
              : "Read-only"}
          </button>
        )}

        {workId &&
          accessRole === "editor" &&
          isDraftMode && (
            <button
              type="button"
              onClick={() =>
                void handleReloadLatestOfficialVersion()
              }
              disabled={
                isSaving ||
                isSubmittingChanges ||
                isUploading
              }
              className="wf-editor-action"
            >
              Reload latest official version
            </button>
          )}

        {workId && accessRole === "editor" && (
          <button
            type="button"
            onClick={() =>
              setIsMySubmissionsOpen(true)
            }
            className="wf-editor-action"
          >
            My Submissions
          </button>
        )}

        {workId && isDraftMode && (
          <button
            type="button"
            onClick={() =>
              void handleSubmitChanges()
            }
            disabled={
              isSaving ||
              isSubmittingChanges ||
              isUploading
            }
            className="wf-editor-action"
          >
            {isSubmittingChanges
              ? "Submitting..."
              : "Submit Changes"}
          </button>
        )}

        <button
          type="button"
          onClick={() => void createNewArtwork()}
          className="wf-editor-action"
        >
          New Artwork
        </button>

        <button
          type="button"
          onClick={downloadPng}
          className="wf-editor-action"
        >
          Download PNG
        </button>


        {workId && isOwner && (
          <button
            type="button"
            onClick={() =>
              setIsCollaboratorPanelOpen(true)
            }
            className="wf-editor-action"
          >
            Collaborators
          </button>
        )}

        {workId && isOwner && (
          <ReviewQueueButton
            workId={workId}
            onOpen={() =>
              setIsReviewQueueOpen(true)
            }
            className="wf-editor-action"
          />
        )}

        {workId && isOwner && (
          <button
            type="button"
            onClick={() => setIsPublishModalOpen(true)}
            disabled={
              !workId ||
              isSaving ||
              isDeleting ||
              isUploading
            }
            className="wf-editor-action"
          >
            Publish
          </button>
        )}

        {workId && isOwner && (
          <button
            type="button"
            onClick={() => void deleteArtwork()}
            disabled={isDeleting}
            className="wf-editor-action wf-editor-action--discard"
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </button>
        )}


        {canEdit && (
          <button
            type="button"
            onClick={() => void saveArtwork()}
            disabled={isSaving || isUploading}
            className="wf-editor-action wf-editor-action--save"
          >
            {isSaving
              ? isDraftMode
                ? "Saving Draft..."
                : "Saving..."
              : isDraftMode
                ? "Save Draft"
                : "Save"}
          </button>
        )}
      </header>
      
      {!canEdit && (
        <div className="border-b border-[var(--wf-warning-200)] bg-[var(--wf-warning-50)] px-6 py-3 text-center text-sm font-medium text-[var(--wf-warning-800)]">
          {accessRole === "editor"
            ? "You have editor access. Switch to Draft Mode to create private changes for owner review."
            : "You have viewer access to this artwork. It is read-only."}
        </div>
      )}

      {message && (
        <div className="border-b border-[var(--wf-primary-100)] bg-[var(--wf-primary-50)] px-6 py-2 text-center text-sm font-medium text-[var(--wf-primary-700)]">
          {message}
        </div>
      )}

      <div className="min-h-0 flex-1">
        <Group orientation="horizontal">
          <Panel
            panelRef={toolsPanelRef}
            defaultSize={280}
            minSize={230}
            maxSize={420}
            collapsible
            collapsedSize={0}
            onResize={(size) => {
              setIsToolsCollapsed(size.inPixels === 0);
            }}
          >
            <aside
              className={`h-full overflow-y-auto border-r border-[var(--wf-neutral-200)] bg-[var(--wf-surface)] p-5 ${
                !canEdit
                  ? "pointer-events-none opacity-40"
                  : ""
              }`}
            >
              <div className="space-y-7">
                <section>
                  <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-[var(--wf-neutral-500)]">
                    Canvas
                  </h2>

                  <label className="flex items-center justify-between gap-3 text-sm font-medium text-[var(--wf-neutral-700)]">
                    Background
                    <input
                      type="color"
                      value={backgroundColor}
                      onChange={(event) =>
                        setBackgroundColor(event.target.value)
                      }
                      className="h-10 w-16 cursor-pointer rounded-lg border border-[var(--wf-neutral-200)] bg-[var(--wf-surface)] p-1"
                    />
                  </label>
                </section>

                <section>
                  <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-[var(--wf-neutral-500)]">
                    Tools
                  </h2>

                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        ["select", "↖ Select"],
                        ["brush", "🖌 Brush"],
                        ["pencil", "✏ Pencil"],
                        ["highlighter", "🖍 Highlighter"],
                        ["eraser", "◻ Eraser"],
                        ["area", "▣ Area Color"],
                      ] as Array<[DrawingTool, string]>
                    ).map(([tool, label]) => (
                      <button
                        key={tool}
                        type="button"
                        onClick={() => setActiveTool(tool)}
                        className={getToolButtonClass(tool)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </section>

                <section>
                  <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-[var(--wf-neutral-500)]">
                    Brush Settings
                  </h2>

                  <label className="flex items-center justify-between gap-3 text-sm font-medium text-[var(--wf-neutral-700)]">
                    Color
                    <input
                      type="color"
                      value={brushColor}
                      onChange={(event) =>
                        setBrushColor(event.target.value)
                      }
                      className="h-10 w-16 cursor-pointer rounded-lg border border-[var(--wf-neutral-200)] bg-[var(--wf-surface)] p-1"
                    />
                  </label>

                  <label className="mt-4 block text-sm font-medium text-[var(--wf-neutral-700)]">
                    <span className="mb-2 flex justify-between">
                      <span>Size</span>
                      <span>{brushSize}px</span>
                    </span>

                    <input
                      type="range"
                      min="1"
                      max="60"
                      value={brushSize}
                      onChange={(event) =>
                        setBrushSize(Number(event.target.value))
                      }
                      className="w-full accent-[var(--wf-primary-600)]"
                    />
                  </label>
                </section>

                <section>
                  <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-[var(--wf-neutral-500)]">
                    Area Color
                  </h2>

                  <label className="flex items-center justify-between gap-3 text-sm font-medium text-[var(--wf-neutral-700)]">
                    Tint
                    <input
                      type="color"
                      value={areaColor}
                      onChange={(event) =>
                        setAreaColor(event.target.value)
                      }
                      className="h-10 w-16 cursor-pointer rounded-lg border border-[var(--wf-neutral-200)] bg-[var(--wf-surface)] p-1"
                    />
                  </label>
                </section>

                <section>
                  <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-[var(--wf-neutral-500)]">
                    Add Image
                  </h2>

                  <label className="block cursor-pointer rounded-xl border border-dashed border-[var(--wf-primary-300)] bg-[var(--wf-primary-50)] px-4 py-3 text-center text-sm font-semibold text-[var(--wf-primary-700)] transition hover:bg-[var(--wf-primary-100)]">
                    {isUploading ? "Uploading..." : "Import Image"}

                    <input
                      type="file"
                      accept="image/*"
                      onChange={(event) =>
                        void handleImageUpload(event)
                      }
                      disabled={isUploading}
                      className="hidden"
                    />
                  </label>
                </section>

                <section>
                  <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-[var(--wf-neutral-500)]">
                    Shapes
                  </h2>

                  <label className="mb-3 flex items-center justify-between gap-3 text-sm font-medium text-[var(--wf-neutral-700)]">
                    Shape Color
                    <input
                      type="color"
                      value={shapeColor}
                      onChange={(event) =>
                        setShapeColor(event.target.value)
                      }
                      className="h-10 w-16 cursor-pointer rounded-lg border border-[var(--wf-neutral-200)] bg-[var(--wf-surface)] p-1"
                    />
                  </label>

                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={addRectangle}
                      className="rounded-xl border border-[var(--wf-neutral-200)] px-2 py-3 text-xs font-medium hover:bg-[var(--wf-neutral-50)]"
                    >
                      Rectangle
                    </button>

                    <button
                      type="button"
                      onClick={addCircle}
                      className="rounded-xl border border-[var(--wf-neutral-200)] px-2 py-3 text-xs font-medium hover:bg-[var(--wf-neutral-50)]"
                    >
                      Circle
                    </button>

                    <button
                      type="button"
                      onClick={addTriangle}
                      className="rounded-xl border border-[var(--wf-neutral-200)] px-2 py-3 text-xs font-medium hover:bg-[var(--wf-neutral-50)]"
                    >
                      Triangle
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={applyColorToSelection}
                    className="mt-3 w-full rounded-xl border border-[var(--wf-primary-200)] bg-[var(--wf-primary-50)] px-3 py-2 text-sm font-semibold text-[var(--wf-primary-700)] hover:bg-[var(--wf-primary-100)]"
                  >
                    Apply Color to Selection
                  </button>
                </section>

                <section>
                  <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-[var(--wf-neutral-500)]">
                    Selected Object
                  </h2>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={bringSelectionForward}
                      className="rounded-xl border border-[var(--wf-neutral-200)] px-2 py-2 text-xs font-medium hover:bg-[var(--wf-neutral-50)]"
                    >
                      Move Forward
                    </button>

                    <button
                      type="button"
                      onClick={sendSelectionBackward}
                      className="rounded-xl border border-[var(--wf-neutral-200)] px-2 py-2 text-xs font-medium hover:bg-[var(--wf-neutral-50)]"
                    >
                      Move Backward
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={deleteSelectedObjects}
                    className="mt-2 w-full rounded-xl border border-[var(--wf-danger-200)] bg-[var(--wf-danger-50)] px-3 py-2 text-sm font-semibold text-[var(--wf-danger-600)] hover:bg-[var(--wf-danger-100)]"
                  >
                    Delete Selection
                  </button>
                </section>
              </div>
            </aside>
          </Panel>

          <Separator className="w-1 cursor-col-resize bg-[var(--wf-neutral-200)] transition hover:bg-[var(--wf-primary-400)]" />

          <Panel minSize={400}>
            <main className="h-full overflow-auto bg-[var(--wf-surface)] p-8">
              <div className="relative mx-auto w-fit">
                <div
                  className={[
                    "overflow-hidden rounded-md bg-[var(--wf-surface)] shadow-2xl transition-opacity",
                    isLoading ? "opacity-40" : "opacity-100",
                  ].join(" ")}
                >
                  <canvas ref={htmlCanvasRef} />
                </div>

                {isLoading && (
                  <div className="absolute inset-x-0 top-0 flex h-[800px] items-center justify-center rounded-md bg-[var(--wf-surface)]/60 font-medium text-[var(--wf-neutral-600)] backdrop-blur-sm">
                    Loading artwork...
                  </div>
                )}

                <p className="mt-4 text-center text-sm text-[var(--wf-neutral-500)]">
                  Canvas size: {CANVAS_WIDTH} × {CANVAS_HEIGHT}px
                </p>
              </div>
            </main>
          </Panel>
        </Group>
      </div>

      {isPublishModalOpen && workId && (
        <PublishWorkModal
          workId={workId}
          initialTitle={title}
          onClose={() => setIsPublishModalOpen(false)}
          onPublished={() => {
            setIsPublishModalOpen(false);
            showMessage("Your artwork has been published.");
          }}
        />
      )}

      {isCollaboratorPanelOpen && workId && (
        <CollaboratorPanel
          workId={workId}
          onClose={() =>
            setIsCollaboratorPanelOpen(false)
          }
        />
      )}

      {isReviewQueueOpen && workId && (
        <ReviewQueuePanel
          workId={workId}
          onClose={() =>
            setIsReviewQueueOpen(false)
          }
          onAccepted={() => {
            setIsReviewQueueOpen(false);
            window.location.reload();
          }}
        />
      )}

      {isMySubmissionsOpen && workId && (
        <MySubmissionsPanel
          workId={workId}
          onClose={() =>
            setIsMySubmissionsOpen(false)
          }
        />
      )}
    </div>
  );
}

export default ImageEditorPage;
