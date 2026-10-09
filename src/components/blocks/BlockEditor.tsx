import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";

import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useDocStore } from "../../store/docStore";
import type { DocumentBlock } from "../../types/document";

// 单行可拖拽区块
const SortableBlockItem = ({
  block,
  onContentChange,
}: {
  block: DocumentBlock;
  onContentChange: (blockId: string, text: string) => void;
}) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: block.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className="p-4 my-2 bg-[var(--wf-surface)] border border-[var(--wf-neutral-200)] rounded shadow-sm flex gap-3 items-start"
    >
      {/* 单独拖拽手柄：只有这里能拖动，不再拦截textarea点击 */}
      <div
        {...listeners}
        className="mt-1 cursor-grab active:cursor-grabbing text-[var(--wf-neutral-400)] select-none"
      >
        ⋮⋮
      </div>

      <div className="flex-1">
        <div className="font-medium">文本区块</div>
        <textarea
          className="w-full mt-2 outline-none border border-[var(--wf-neutral-200)] rounded p-2"
          rows={3}
          placeholder="在这里输入内容..."
          value={String(block.content ?? "")}
          onChange={(e) => onContentChange(block.id, e.target.value)}
        />
      </div>
    </div>
  );
};

export const BlockEditor = () => {
  const { getActiveDocument, updateDocBlocks } = useDocStore();
  const activeDoc = getActiveDocument();
  if (!activeDoc) return null;

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = activeDoc.blocks.findIndex((b) => b.id === active.id);
    const newIndex = activeDoc.blocks.findIndex((b) => b.id === over.id);
    const newBlocks = arrayMove(activeDoc.blocks, oldIndex, newIndex);
    updateDocBlocks(activeDoc.id, newBlocks);
  };

  // 更新单个区块文本
  const handleBlockContentChange = (blockId: string, text: string) => {
    const newBlocks = activeDoc.blocks.map((block) => {
      if (block.id === blockId) {
        return { ...block, content: text };
      }
      return block;
    });
    updateDocBlocks(activeDoc.id, newBlocks);
  };

  // 添加新文本区块
  const addTextBlock = () => {
    const newBlock: DocumentBlock = {
      id: crypto.randomUUID(),
      type: "text",
      content: "",
    };
    updateDocBlocks(activeDoc.id, [...activeDoc.blocks, newBlock]);
  };

  return (
    <div className="p-4">
      <button
        onClick={addTextBlock}
        className="px-3 py-1 border rounded mb-4 hover:bg-[var(--wf-neutral-100)]"
      >
        + 添加文本区块
      </button>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={activeDoc.blocks} strategy={verticalListSortingStrategy}>
          {activeDoc.blocks.map((block) => (
            <SortableBlockItem
              key={block.id}
              block={block}
              onContentChange={handleBlockContentChange}
            />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
};
