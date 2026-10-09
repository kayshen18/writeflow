import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";

import type {
  CSSProperties,
  DragEvent,
  MouseEvent,
} from "react";

import {
  createEditor,
  Editor,
  Element,
  Node,
  Path,
  Transforms,
} from "slate";

import type {
  Descendant,
} from "slate";

import {
  Editable,
  ReactEditor,
  Slate,
  useFocused,
  useSelected,
  useSlateStatic,
  withReact,
} from "slate-react";

import type {
  RenderElementProps,
} from "slate-react";

import type {
  ImageElement,
} from "../../types/slate";

export type SlateEditorHandle = {
  insertImage: (
    image: Omit<
      ImageElement,
      "type" | "children"
    >,
  ) => void;
};

type SlateEditorProps = {
  value: Descendant[];

  onChange: (
    value: Descendant[],
  ) => void;

  onRemoveImage: (
    filePath: string,
  ) => void;

  fontFamily: string;
  fontSize: number;
  fontColor: string;
  fontWeight: number;

  readOnly?: boolean;
};

type ParagraphBlockProps =
  RenderElementProps & {
    readOnly: boolean;
  };

type ImageBlockProps =
  RenderElementProps & {
    onRemoveImage: (
      filePath: string,
    ) => void;
    readOnly: boolean;
  };

const IMAGE_DRAG_TYPE =
  "application/x-writeflow-image-path";

function withImages(editor: Editor) {
  const { isVoid } = editor;

  editor.isVoid = (element) => {
    if (
      Element.isElement(element) &&
      element.type === "image"
    ) {
      return true;
    }

    return isVoid(element);
  };

  return editor;
}

function isImageDrag(
  event: DragEvent<HTMLElement>,
) {
  return event.dataTransfer.types.includes(
    IMAGE_DRAG_TYPE,
  );
}

function getDraggedImagePath(
  event: DragEvent<HTMLElement>,
): Path | null {
  const serializedPath =
    event.dataTransfer.getData(
      IMAGE_DRAG_TYPE,
    );

  if (!serializedPath) {
    return null;
  }

  try {
    const parsedPath =
      JSON.parse(serializedPath);

    if (!Array.isArray(parsedPath)) {
      return null;
    }

    return parsedPath as Path;
  } catch {
    return null;
  }
}

function getDropPosition(
  event: DragEvent<HTMLElement>,
): "before" | "after" {
  const rectangle =
    event.currentTarget.getBoundingClientRect();

  const middle =
    rectangle.top +
    rectangle.height / 2;

  return event.clientY < middle
    ? "before"
    : "after";
}

function focusNearestParagraph(
  editor: Editor,
  preferredIndex: number,
) {
  const childCount =
    editor.children.length;

  if (childCount === 0) {
    return;
  }

  const candidateIndexes: number[] = [];

  for (
    let distance = 0;
    distance < childCount;
    distance += 1
  ) {
    candidateIndexes.push(
      preferredIndex + distance,
    );

    if (distance > 0) {
      candidateIndexes.push(
        preferredIndex - distance,
      );
    }
  }

  for (
    const candidateIndex
    of candidateIndexes
  ) {
    if (
      candidateIndex < 0 ||
      candidateIndex >= childCount
    ) {
      continue;
    }

    const candidatePath: Path = [
      candidateIndex,
    ];

    let candidateNode: Node;

    try {
      candidateNode =
        Node.get(
          editor,
          candidatePath,
        );
    } catch {
      continue;
    }

    if (
      Element.isElement(
        candidateNode,
      ) &&
      candidateNode.type !== "image"
    ) {
      Transforms.select(
        editor,
        Editor.start(
          editor,
          candidatePath,
        ),
      );

      ReactEditor.focus(editor);
      return;
    }
  }
}

function moveImageNode(
  editor: Editor,
  sourcePath: Path,
  targetPath: Path,
  position: "before" | "after",
): number | null {
  if (
    sourcePath.length === 0 ||
    targetPath.length === 0
  ) {
    return null;
  }

  if (
    Path.equals(
      sourcePath,
      targetPath,
    )
  ) {
    return null;
  }

  const sourceIndex =
    sourcePath[0];

  const targetIndex =
    targetPath[0];

  let draggedNode: Node;

  try {
    draggedNode =
      Node.get(
        editor,
        sourcePath,
      );
  } catch {
    return null;
  }

  if (
    !Element.isElement(
      draggedNode,
    ) ||
    draggedNode.type !== "image"
  ) {
    return null;
  }

  const clonedImage: ImageElement = {
    ...draggedNode,
    children: [
      {
        text: "",
      },
    ],
  };

  let adjustedTargetIndex =
    targetIndex;

  if (sourceIndex < targetIndex) {
    adjustedTargetIndex -= 1;
  }

  let insertionIndex =
    position === "after"
      ? adjustedTargetIndex + 1
      : adjustedTargetIndex;

  Editor.withoutNormalizing(
    editor,
    () => {
      Transforms.removeNodes(
        editor,
        {
          at: sourcePath,
        },
      );

      insertionIndex = Math.max(
        0,
        Math.min(
          insertionIndex,
          editor.children.length,
        ),
      );

      Transforms.insertNodes(
        editor,
        clonedImage,
        {
          at: [insertionIndex],
        },
      );
    },
  );

  return insertionIndex;
}

function ParagraphBlock({
  readOnly,
  ...props
}: ParagraphBlockProps) {
  const editor = useSlateStatic();

  const [
    dropPosition,
    setDropPosition,
  ] = useState<
    "before" | "after" | null
  >(null);

  function handleDragOver(
    event: DragEvent<HTMLDivElement>,
  ) {
    if (readOnly || !isImageDrag(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    event.dataTransfer.dropEffect =
      "move";

    setDropPosition(
      getDropPosition(event),
    );
  }

  function handleDragLeave(
    event: DragEvent<HTMLDivElement>,
  ) {
    if (readOnly) {
      return;
    }

    const nextElement =
      event.relatedTarget as
        | HTMLElement
        | null;

    if (
      nextElement &&
      event.currentTarget.contains(
        nextElement,
      )
    ) {
      return;
    }

    setDropPosition(null);
  }

  function handleDrop(
    event: DragEvent<HTMLDivElement>,
  ) {
    if (readOnly || !isImageDrag(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const sourcePath =
      getDraggedImagePath(event);

    if (!sourcePath) {
      setDropPosition(null);
      return;
    }

    const targetPath =
      ReactEditor.findPath(
        editor,
        props.element,
      );

    const position =
      getDropPosition(event);

    const targetPathRef =
      Editor.pathRef(
        editor,
        targetPath,
        {
          affinity: "forward",
        },
      );

    moveImageNode(
      editor,
      sourcePath,
      targetPath,
      position,
    );

    const updatedTargetPath =
      targetPathRef.unref();

    if (updatedTargetPath) {
      try {
        const nextPoint =
          position === "before"
            ? Editor.start(
                editor,
                updatedTargetPath,
              )
            : Editor.end(
                editor,
                updatedTargetPath,
              );

        Transforms.select(
          editor,
          nextPoint,
        );

        ReactEditor.focus(editor);
      } catch {
        focusNearestParagraph(
          editor,
          updatedTargetPath[0],
        );
      }
    }

    setDropPosition(null);
  }

  return (
    <div
      {...props.attributes}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`mb-4 min-h-8 py-1 transition ${
        dropPosition === "before"
          ? "border-t-2 border-[var(--wf-primary-500)]"
          : ""
      } ${
        dropPosition === "after"
          ? "border-b-2 border-[var(--wf-primary-500)]"
          : ""
      }`}
    >
      {props.children}
    </div>
  );
}

function ImageBlock({
  attributes,
  children,
  element,
  onRemoveImage,
  readOnly,
}: ImageBlockProps) {
  const editor = useSlateStatic();

  const selected = useSelected();
  const focused = useFocused();

  const imageElement =
    element as ImageElement;

  const [
    isDragging,
    setIsDragging,
  ] = useState(false);

  const [
    dropPosition,
    setDropPosition,
  ] = useState<
    "before" | "after" | null
  >(null);

  function getImagePath() {
    return ReactEditor.findPath(
      editor,
      imageElement,
    );
  }

  function handleDragStart(
    event: DragEvent<HTMLImageElement>,
  ) {
    if (readOnly) {
      event.preventDefault();
      return;
    }

    const path = getImagePath();

    event.dataTransfer.effectAllowed =
      "move";

    event.dataTransfer.setData(
      IMAGE_DRAG_TYPE,
      JSON.stringify(path),
    );

    setIsDragging(true);
  }

  function handleDragEnd() {
    if (readOnly) {
      return;
    }

    setIsDragging(false);
    setDropPosition(null);
  }

  function handleDragOver(
    event: DragEvent<HTMLDivElement>,
  ) {
    if (readOnly || !isImageDrag(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    event.dataTransfer.dropEffect =
      "move";

    setDropPosition(
      getDropPosition(event),
    );
  }

  function handleDragLeave(
    event: DragEvent<HTMLDivElement>,
  ) {
    if (readOnly) {
      return;
    }

    const nextElement =
      event.relatedTarget as
        | HTMLElement
        | null;

    if (
      nextElement &&
      event.currentTarget.contains(
        nextElement,
      )
    ) {
      return;
    }

    setDropPosition(null);
  }

  function handleDrop(
    event: DragEvent<HTMLDivElement>,
  ) {
    if (readOnly || !isImageDrag(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const sourcePath =
      getDraggedImagePath(event);

    if (!sourcePath) {
      setDropPosition(null);
      return;
    }

    const targetPath =
      getImagePath();

    if (
      Path.equals(
        sourcePath,
        targetPath,
      )
    ) {
      setDropPosition(null);
      return;
    }

    const position =
      getDropPosition(event);

    const insertionIndex =
      moveImageNode(
        editor,
        sourcePath,
        targetPath,
        position,
      );

    if (insertionIndex !== null) {
      focusNearestParagraph(
        editor,
        position === "after"
          ? insertionIndex + 1
          : insertionIndex - 1,
      );
    }

    setDropPosition(null);
  }

  function preventToolbarMouseDown(
    event: MouseEvent<HTMLElement>,
  ) {
    event.preventDefault();
    event.stopPropagation();
  }

  function changeAlignment(
    alignment:
      | "left"
      | "center"
      | "right",
  ) {
    if (readOnly) {
      return;
    }

    const path = getImagePath();

    Transforms.setNodes(
      editor,
      {
        alignment,
      },
      {
        at: path,
      },
    );
  }

  function changeWidth(
    width: number,
  ) {
    if (readOnly) {
      return;
    }

    const path = getImagePath();

    Transforms.setNodes(
      editor,
      {
        width,
      },
      {
        at: path,
      },
    );
  }

  function removeImage() {
    if (readOnly) {
      return;
    }

    const path = getImagePath();
    const imageIndex = path[0];

    onRemoveImage(
      imageElement.filePath,
    );

    Transforms.removeNodes(
      editor,
      {
        at: path,
      },
    );

    focusNearestParagraph(
      editor,
      imageIndex,
    );
  }

  const alignmentStyle:
    CSSProperties =
    imageElement.alignment === "left"
      ? {
          marginRight: "auto",
        }
      : imageElement.alignment ===
          "right"
        ? {
            marginLeft: "auto",
          }
        : {
            marginLeft: "auto",
            marginRight: "auto",
          };

  return (
    <div
      {...attributes}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`group relative my-5 transition ${
        isDragging
          ? "opacity-50"
          : "opacity-100"
      } ${
        dropPosition === "before"
          ? "border-t-2 border-[var(--wf-primary-500)] pt-2"
          : ""
      } ${
        dropPosition === "after"
          ? "border-b-2 border-[var(--wf-primary-500)] pb-2"
          : ""
      }`}
    >
      <div
        contentEditable={false}
        className="relative"
      >
        {!readOnly && (
          <div
            onMouseDown={
              preventToolbarMouseDown
            }
            className="pointer-events-none absolute left-1/2 top-2 z-20 flex max-w-[95%] -translate-x-1/2 flex-wrap items-center justify-center gap-1 rounded-xl bg-[var(--wf-neutral-900)]/90 p-1.5 opacity-0 shadow-lg backdrop-blur-sm transition group-hover:pointer-events-auto group-hover:opacity-100"
          >
            <span className="select-none rounded-lg px-3 py-2 text-xs text-[var(--wf-surface)]">
              Drag Image
            </span>

            <button
              type="button"
              onMouseDown={(event) => {
                preventToolbarMouseDown(
                  event,
                );

                changeAlignment("left");
              }}
              className={`rounded-lg px-3 py-2 text-xs text-[var(--wf-surface)] transition hover:bg-[var(--wf-surface)]/20 ${
                imageElement.alignment ===
                "left"
                  ? "bg-[var(--wf-surface)]/20"
                  : ""
              }`}
            >
              Left
            </button>

            <button
              type="button"
              onMouseDown={(event) => {
                preventToolbarMouseDown(
                  event,
                );

                changeAlignment(
                  "center",
                );
              }}
              className={`rounded-lg px-3 py-2 text-xs text-[var(--wf-surface)] transition hover:bg-[var(--wf-surface)]/20 ${
                imageElement.alignment ===
                "center"
                  ? "bg-[var(--wf-surface)]/20"
                  : ""
              }`}
            >
              Center
            </button>

            <button
              type="button"
              onMouseDown={(event) => {
                preventToolbarMouseDown(
                  event,
                );

                changeAlignment("right");
              }}
              className={`rounded-lg px-3 py-2 text-xs text-[var(--wf-surface)] transition hover:bg-[var(--wf-surface)]/20 ${
                imageElement.alignment ===
                "right"
                  ? "bg-[var(--wf-surface)]/20"
                  : ""
              }`}
            >
              Right
            </button>

            <label
              onMouseDown={(event) => {
                event.stopPropagation();
              }}
              className="flex items-center gap-2 rounded-lg px-2 py-1 text-xs text-[var(--wf-surface)]"
            >
              Width

              <input
                type="range"
                min="160"
                max="900"
                value={
                  imageElement.width
                }
                onChange={(event) => {
                  changeWidth(
                    Number(
                      event.target.value,
                    ),
                  );
                }}
                className="w-24"
              />
            </label>

            <button
              type="button"
              onMouseDown={(event) => {
                preventToolbarMouseDown(
                  event,
                );

                removeImage();
              }}
              className="rounded-lg px-3 py-2 text-xs text-[var(--wf-danger-300)] transition hover:bg-[var(--wf-danger-500)]/20"
            >
              Remove
            </button>
          </div>
        )}

        <img
          src={imageElement.url}
          alt={imageElement.alt}
          draggable={!readOnly}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          style={{
            width: `${imageElement.width}px`,
            maxWidth: "100%",
            height: "auto",
            ...alignmentStyle,
          }}
          className={`block object-contain ${
            readOnly
              ? "cursor-default"
              : "cursor-grab active:cursor-grabbing"
          } ${
            selected &&
            focused &&
            !readOnly
              ? "outline outline-2 outline-[var(--wf-primary-500)] outline-offset-4"
              : ""
          }`}
        />
      </div>

      {children}
    </div>
  );
}

const SlateEditor = forwardRef<
  SlateEditorHandle,
  SlateEditorProps
>(function SlateEditor(
  {
    value,
    onChange,
    onRemoveImage,
    fontFamily,
    fontSize,
    fontColor,
    fontWeight,
    readOnly = false,
  },
  ref,
) {
  const editor = useMemo(
    () =>
      withImages(
        withReact(createEditor()),
      ),
    [],
  );

  useImperativeHandle(
    ref,
    () => ({
      insertImage(image) {
        if (readOnly) {
          return;
        }

        const imageNode:
          ImageElement = {
          type: "image",
          id: image.id,
          url: image.url,
          filePath:
            image.filePath,
          alt: image.alt,
          width: image.width,
          alignment:
            image.alignment,
          children: [
            {
              text: "",
            },
          ],
        };

        const paragraphNode = {
          type: "paragraph" as const,
          children: [
            {
              text: "",
            },
          ],
        };

        let imagePath: Path = [
          editor.children.length,
        ];

        if (editor.selection) {
          const currentBlock =
            Editor.above(editor, {
              at: editor.selection,
              match: (node) =>
                Element.isElement(
                  node,
                ) &&
                Editor.isBlock(
                  editor,
                  node,
                ),
            });

          if (currentBlock) {
            imagePath = Path.next(
              currentBlock[1],
            );
          }
        }

        const paragraphPath =
          Path.next(imagePath);

        Editor.withoutNormalizing(
          editor,
          () => {
            Transforms.insertNodes(
              editor,
              imageNode,
              {
                at: imagePath,
              },
            );

            Transforms.insertNodes(
              editor,
              paragraphNode,
              {
                at: paragraphPath,
              },
            );
          },
        );

        Transforms.select(
          editor,
          Editor.start(
            editor,
            paragraphPath,
          ),
        );

        ReactEditor.focus(editor);
      },
    }),
    [editor, readOnly],
  );

  const renderElement = useCallback(
    (props: RenderElementProps) => {
      if (
        props.element.type === "image"
      ) {
        return (
          <ImageBlock
            {...props}
            onRemoveImage={
              onRemoveImage
            }
            readOnly={readOnly}
          />
        );
      }

      return (
        <ParagraphBlock
          {...props}
          readOnly={readOnly}
        />
      );
    },
    [onRemoveImage, readOnly],
  );

  return (
    <Slate
      editor={editor}
      initialValue={value}
      onChange={(nextValue) => {
        if (!readOnly) {
          onChange(nextValue);
        }
      }}
    >
      <Editable
        readOnly={readOnly}
        renderElement={
          renderElement
        }
        placeholder={
          readOnly
            ? ""
            : "Start writing here..."
        }
        onDrop={(event) => {
          if (readOnly) {
            event.preventDefault();
            return;
          }

          if (
            event.dataTransfer.types.includes(
              IMAGE_DRAG_TYPE,
            )
          ) {
            event.preventDefault();
          }
        }}
        style={{
          minHeight: "28rem",
          outline: "none",
          fontFamily,
          fontSize: `${fontSize}px`,
          color: fontColor,
          fontWeight,
          lineHeight: 1.8,
        }}
      />
    </Slate>
  );
});

export default SlateEditor;
