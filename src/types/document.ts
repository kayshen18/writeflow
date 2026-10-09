/** 单条文档块（拖拽块，用于Slate编辑器） */
export type DocumentBlock = {
  id: string;
  type: "text" | "image" | "table";
  content: unknown;
};

/** 文档数据模型 */
export interface DocumentItem {
  id: string;
  title: string;
  blocks: DocumentBlock[];
  createdAt: number;
  updatedAt: number;
}

/** 全局文档仓库State类型 */
export interface DocStoreState {
  documentList: DocumentItem[];
  activeDocId: string | null;
  // 当前激活文档快捷获取
  getActiveDocument: () => DocumentItem | undefined;
  // 新增文档
  createDocument: () => void;
  // 删除文档
  deleteDocument: (docId: string) => void;
  // 切换当前编辑文档
  setActiveDocId: (docId: string) => void;
  // 更新文档标题
  updateDocTitle: (docId: string, title: string) => void;
  // 更新文档内所有内容块
  updateDocBlocks: (docId: string, blocks: DocumentBlock[]) => void;
}
