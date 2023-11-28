import { model, Schema, Types } from 'mongoose';

export enum ProjectStatus {
  DRAFT = 'DRAFT',
  UPLOADING = 'UPLOADING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETING = 'COMPLETING',
  COMPLETED = 'COMPLETED',
}

export enum TrainingStatus {
  STOP = 'STOP',
  INITIALIZING = 'INITIALIZING',
  RUNNING = 'RUNNING',
}

export enum ActionType {
  LIVE_UPDATE_ON = 'LIVE_UPDATE_ON',
  LIVE_UPDATE_OFF = 'LIVE_UPDATE_OFF',
  ADD_ANNOTATION = 'ADD_ANNOTATION',
  UPDATE = 'UPDATE',
  SUGGEST = 'SUGGEST',
  CALCULATE = 'CALCULATE',
  EXPORT_MODEL = 'EXPORT_MODEL',
  IMPORT_MODEL = 'IMPORT_MODEL',
}

const annotationClassSchema = new Schema({
  name: {
    type: String,
    required: true,
  },
  color: {
    type: String,
    required: true,
  },
  hotKey: String,
  description: String,
});

const projectSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(ProjectStatus),
      required: true,
    },
    trainingStatus: {
      type: String,
      enum: Object.values(TrainingStatus),
      default: TrainingStatus.STOP,
    },
    totalImages: {
      type: Number,
      required: true,
      default: 0,
    },
    suggestImageIndices: [Number],
    annotationClasses: [annotationClassSchema],
    trainingProgress: { type: Number, min: 0, max: 1, default: 0 },
    avgDiceScore: { type: Number, default: 0 },
    errorDiceScore: { type: Number, default: 0 },
    avgPrecision: { type: Number, default: 0 },
    avgRecall: { type: Number, default: 0 },
    annotationUpdatedAt: {
      type: Date,
      default: Date.now,
    },
    metricUpdatedAt: {
      type: Date,
      default: Date.now,
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

projectSchema.virtual('id').get(function getter() {
  return this._id.toString();
});

export interface AnnotationClass {
  id: Types.ObjectId | string;
  name: string;
  color: string;
  hotKey?: string;
  description?: string;
}

export interface Project {
  id: Types.ObjectId | string;
  name: string;
  description: string;
  status: ProjectStatus;
  trainingStatus: TrainingStatus;
  totalImages: number;
  suggestImageIndices: number[];
  annotationClasses: AnnotationClass[];
  trainingProgress: number;
  avgDiceScore: number;
  errorDiceScore: number;
  avgPrecision: number;
  avgRecall: number;
  createdAt: Date;
  updatedAt: Date;
  annotationUpdatedAt: Date;
  metricUpdatedAt: Date;
  createdBy: Types.ObjectId;
}

export const ProjectModel = model<Project>('Project', projectSchema);
