import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import mongoose from "mongoose";
import { databaseConfigs } from "../configs";
import { ProjectNotFoundError, splitAndUploadImages, updateProject } from "../utils/splitAndUploadImages";
import { ProjectModel, ProjectStatus } from "../models";
import { createOrUpdateAKSPod } from "../utils/aks.util";

export async function httpTriggerSplitImage(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const projectId = request.query.get('projectId');

    context.info(`Project ${projectId} start processing split images.`);

    const body = await request.json() as { fileNames: string[] };
    const fileNames = body.fileNames;

    mongoose.set('strictQuery', true);
    mongoose.set('autoCreate', true);
    await mongoose.connect(databaseConfigs.URI);

    await splitAndUploadImages(projectId, fileNames);

    const project = await ProjectModel.findById(projectId).exec();

    if (!project) {
      throw new ProjectNotFoundError(projectId);
    }

    const uploadFirstTime = project.totalImages === 0;

    if (!uploadFirstTime) {
      await createOrUpdateAKSPod(projectId);
      context.info(`Project ${projectId} - Create AKS Pod successfully!`);
    }

    await updateProject(projectId, {
      status: ProjectStatus.IN_PROGRESS,
    });
    context.info(`Project ${projectId} is ready!`);

    return {
      body: `Project ${projectId} is ready!`,
    };
  } catch (error) {
    return {
      body: `error: ${error}`,
    };
  }
};

app.http('httpTriggerSplitImage', {
  methods: ['POST'],
  authLevel: 'function',
  handler: httpTriggerSplitImage
});
