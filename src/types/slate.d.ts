import type {
  BaseEditor,
  BaseElement,
  BaseText,
} from "slate";

import type {
  ReactEditor,
} from "slate-react";

export type CustomText =
  BaseText & {
    bold?: boolean;
    color?: string;
    fontFamily?: string;
    fontSize?: number;
  };

export type EmptyText = {
  text: "";
};

export type ParagraphElement = {
  type: "paragraph";
  children: CustomText[];
};

export type ImageElement = {
  type: "image";
  id: string;
  url: string;
  filePath: string;
  alt: string;
  width: number;
  alignment:
    | "left"
    | "center"
    | "right";
  children: EmptyText[];
};

export type CustomElement =
  | ParagraphElement
  | ImageElement;

declare module "slate" {
  interface CustomTypes {
    Editor:
      BaseEditor &
      ReactEditor;

    Element:
      CustomElement &
      BaseElement;

    Text: CustomText;
  }
}