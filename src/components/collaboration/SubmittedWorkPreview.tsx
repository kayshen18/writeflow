import {
  useEffect,
  useRef,
  useState,
} from "react";
import { StaticCanvas } from "fabric";
import { getUploadUrl } from "../../lib/api";

type PreviewNode = {
  text?: string;
  type?: string;
  url?: string;
  src?: string;
  filePath?: string;
  width?: number;
  alignment?: "left" | "center" | "right";
  children?: PreviewNode[];
};

type SubmittedWorkPreviewProps = {
  content: unknown;
};

type DrawingData = {
  width?: number;
  height?: number;
  objects?: unknown[];
};

function parseContent(content: unknown) {
  if (typeof content !== "string") {
    return content;
  }

  try {
    return JSON.parse(content) as unknown;
  } catch {
    return content;
  }
}

function getImageUrl(node: PreviewNode) {
  if (node.url) {
    return node.url;
  }

  if (node.src) {
    return node.src;
  }

  if (node.filePath) {
    return getUploadUrl(node.filePath);
  }

  return null;
}

function nodeText(node: PreviewNode): string {
  if (typeof node.text === "string") {
    return node.text;
  }

  return (node.children ?? [])
    .map(nodeText)
    .join("");
}

function DrawingPreview({
  drawingData,
}: {
  drawingData: unknown;
}) {
  const containerRef =
    useRef<HTMLDivElement | null>(null);

  const canvasRef =
    useRef<HTMLCanvasElement | null>(null);

  const [availableWidth, setAvailableWidth] =
    useState(600);

  useEffect(() => {
    const container = containerRef.current!;

    if (!container) {
      return;
    }

    function updateWidth() {
      const nextWidth =
        container.clientWidth - 32;

      setAvailableWidth(
        Math.max(280, nextWidth),
      );
    }

    updateWidth();

    const resizeObserver = new ResizeObserver(
      updateWidth,
    );

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }

    const drawing =
      drawingData as DrawingData;

    /*
     * The normal drawing editor uses
     * a 1200 × 800 canvas. If an older
     * saved drawing lacks width / height,
     * these fallback values preserve it.
     */
    const sourceWidth =
      typeof drawing.width === "number" &&
      drawing.width > 0
        ? drawing.width
        : 1200;

    const sourceHeight =
      typeof drawing.height === "number" &&
      drawing.height > 0
        ? drawing.height
        : 800;

    const scale =
      availableWidth / sourceWidth;

    const previewHeight = Math.round(
      sourceHeight * scale,
    );

    const canvas = new StaticCanvas(
      canvasRef.current,
      {
        width: availableWidth,
        height: previewHeight,
        backgroundColor: "#ffffff",
      },
    );

    async function renderDrawing() {
      try {
        await canvas.loadFromJSON(drawingData as Record<string, any>);

        /*
         * Fabric objects keep their original
         * coordinates, so zoom scales the
         * complete original canvas proportionally.
         */
        canvas.setZoom(scale);

        canvas.setDimensions({
          width: availableWidth,
          height: previewHeight,
        });

        canvas.getObjects().forEach(
          (object) => {
            object.set({
              selectable: false,
              evented: false,
            });
          },
        );

        canvas.requestRenderAll();
      } catch (error) {
        console.error(
          "Unable to render draft artwork:",
          error,
        );
      }
    }

    void renderDrawing();

    return () => {
      canvas.dispose();
    };
  }, [drawingData, availableWidth]);

  return (
    <div
      ref={containerRef}
      className="rounded-xl bg-[var(--wf-neutral-200)] p-4"
    >
      <div className="overflow-hidden rounded-lg bg-[var(--wf-surface)] shadow">
        <canvas
          ref={canvasRef}
          className="block"
        />
      </div>
    </div>
  );
}

function WritingPreview({
  nodes,
}: {
  nodes: PreviewNode[];
}) {
  return (
    <div className="overflow-auto rounded-xl border border-[var(--wf-neutral-200)] bg-[var(--wf-neutral-100)] p-5">
      <article
        className="mx-auto min-h-[28rem] w-full max-w-3xl rounded-lg bg-[var(--wf-surface)] p-10 shadow-sm"
        style={{ zoom: 0.75 }}
      >
        {nodes.map((node, index) => {
          const imageUrl = getImageUrl(node);

          if (
            node.type === "image" &&
            imageUrl
          ) {
            const alignment =
              node.alignment === "left"
                ? "mr-auto"
                : node.alignment === "right"
                  ? "ml-auto"
                  : "mx-auto";

            return (
              <img
                key={`${imageUrl}-${index}`}
                src={imageUrl}
                alt="Submitted illustration"
                className={`my-6 block max-w-full object-contain ${alignment}`}
                style={{
                  width: node.width
                    ? `${node.width}px`
                    : "100%",
                }}
              />
            );
          }

          return (
            <p
              key={index}
              className="mb-4 whitespace-pre-wrap text-lg leading-8 text-[var(--wf-neutral-800)]"
            >
              {nodeText(node) || "\u00A0"}
            </p>
          );
        })}
      </article>
    </div>
  );
}

function SubmittedWorkPreview({
  content,
}: SubmittedWorkPreviewProps) {
  const parsedContent = parseContent(content);

  const isDrawing =
    parsedContent !== null &&
    typeof parsedContent === "object" &&
    !Array.isArray(parsedContent) &&
    "objects" in parsedContent;

  if (isDrawing) {
    return (
      <DrawingPreview
        drawingData={parsedContent}
      />
    );
  }

  if (Array.isArray(parsedContent)) {
    return (
      <WritingPreview
        nodes={parsedContent as PreviewNode[]}
      />
    );
  }

  return (
    <div className="rounded-xl bg-[var(--wf-neutral-50)] p-5 text-[var(--wf-neutral-500)]">
      This submitted draft could not be previewed.
    </div>
  );
}

export default SubmittedWorkPreview;
