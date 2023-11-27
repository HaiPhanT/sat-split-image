import mongoose, { Schema, Types, model } from 'mongoose';

enum Tool {
  PEN = 'PEN',
  ERASER = 'ERASER',
}

const lineSchema = new Schema(
  {
    tool: {
      type: String,
      enum: Object.values(Tool),
      required: true,
    },
    size: Number,
    annotationClassId: String,
    points: [Number],
  },
  { _id: false },
);

const annotationSchema = new Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
    },
    imageIndex: Number,
    annotations: [Buffer],
    lines: [lineSchema],
  },
  { timestamps: true },
);

export interface Line {
  tool: Tool;
  size: number;
  annotationClassId: string;
  points: number[];
}

export interface Annotation {
  projectId: Types.ObjectId | string;
  imageIndex: number;
  annotations: Buffer[];
  lines: Line[];
  createdAt: Date;
  updatedAt: Date;
}

export const AnnotationModel = model<Annotation>(
  'Annotation',
  annotationSchema,
);
