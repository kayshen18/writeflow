import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { DocStoreState, DocumentItem } from "../types/document";
import { v4 as uuidv4 } from "uuid";

export const useDocStore = create<DocStoreState>()(
  persist(
    (set, get) => ({
      documentList: [],
      activeDocId: null,

      getActiveDocument() {
        const { documentList, activeDocId } = get();
        return documentList.find((doc) => doc.id === activeDocId);
      },

      createDocument() {
        const now = Date.now();
        const newDoc: DocumentItem = {
          id: uuidv4(),
          title: "未命名文档",
          blocks: [],
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({
          documentList: [...state.documentList, newDoc],
          activeDocId: newDoc.id,
        }));
      },

      deleteDocument(docId) {
        const { documentList, activeDocId } = get();
        const newList = documentList.filter((item) => item.id !== docId);
        let nextActiveId = activeDocId;
        // 如果删除的是当前文档，自动切换到第一个文档
        if (activeDocId === docId) {
          nextActiveId = newList.length > 0 ? newList[0].id : null;
        }
        set({
          documentList: newList,
          activeDocId: nextActiveId,
        });
      },

      setActiveDocId(docId) {
        set({ activeDocId: docId });
      },

      updateDocTitle(docId, title) {
        set((state) => ({
          documentList: state.documentList.map((doc) =>
            doc.id === docId
              ? { ...doc, title, updatedAt: Date.now() }
              : doc
          ),
        }));
      },

      updateDocBlocks(docId, blocks) {
        set((state) => ({
          documentList: state.documentList.map((doc) =>
            doc.id === docId
              ? { ...doc, blocks, updatedAt: Date.now() }
              : doc
          ),
        }));
      },
    }),
    {
      name: "writeflow-storage", // localStorage key名称
    }
  )
);
