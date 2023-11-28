import sharp from 'sharp';
import { appConfigs, azureConfigs } from "../configs";
import { AnnotationModel, Project, ProjectModel, ProjectStatus } from "../models";
import { AppError } from "./appError.util";
import { createSharpInstance } from "./sharp.util";
import { addNumberPadding } from "./number.util";
import { UpdateQuery } from "mongoose";
import { BlobServiceClient } from '@azure/storage-blob';
import { promiseAllInBatches } from './promise.util';

export class ProjectNotFoundError extends AppError {
    constructor(id?: string) {
        super(`Project ${id} not found`, 'PROJECT_NOT_FOUND', 404);
    }
}

class ProjectUpdateError extends AppError {
    constructor(reason?: string) {
        super(reason || 'Project update error', 'PROJECT_UPDATE_ERROR', 500);
    }
}

type ImageItem = {
    name: string;
    data: Buffer;
};

export const splitAndUploadImages = async (
    projectId: string,
    fileNames: string[],
): Promise<void> => {
    try {
        for (const fileName of fileNames) {
            console.info(
                `Project ${projectId} - ${fileName} - Download images started!`,
            );
            const imgBuffer = await downloadImageBuffer(
                azureConfigs.STORAGE.ORIGINAL_CONTAINER_NAME,
                `${projectId}/${fileName}`,
            );
            console.info(
                `Project ${projectId} - ${fileName} - Download images successfully!`,
            );

            verifyFileBuffer({
                projectId,
                fileBuffer: imgBuffer,
            });

            const project = await ProjectModel.findById(projectId).exec();

            if (!project) {
                throw new ProjectNotFoundError(projectId);
            }

            let imageItemIndex = project.totalImages;

            const { numRows, numColumns, width, height } =
                await calculateImageTiles(imgBuffer);

            const { IMAGE_SIZE } = appConfigs;
            let sharpInstances: sharp.Sharp[] = [];
            let promises: Promise<ImageItem>[] = [];
            const splitFileNames = fileName.split('.');
            const extension = splitFileNames[splitFileNames.length - 1];
            const fileNameWithoutExtension = splitFileNames
                .slice(0, splitFileNames.length - 1)
                .join('.');

            for (let row = 0; row < numRows; row++) {
                for (let column = 0; column < numColumns; column++) {
                    const startX = column * IMAGE_SIZE;
                    const startY = row * IMAGE_SIZE;
                    const endX = Math.min((column + 1) * IMAGE_SIZE, width);
                    const endY = Math.min((row + 1) * IMAGE_SIZE, height);
                    const rectWidth = endX - startX;
                    const rectHeight = endY - startY;
                    const isEdged = rectWidth < IMAGE_SIZE || rectHeight < IMAGE_SIZE;

                    if (isEdged) {
                        const hasRightGap = rectWidth < IMAGE_SIZE;
                        const rightPadding = IMAGE_SIZE - rectWidth;
                        const hasBottomGap = rectHeight < IMAGE_SIZE;
                        const bottomPadding = IMAGE_SIZE - rectHeight;
                        const sharp = createSharpInstance(imgBuffer);
                        sharpInstances.push(sharp);

                        const rectangleImage = sharp
                            .extract({
                                top: startY,
                                left: startX,
                                width: rectWidth,
                                height: rectHeight,
                            })
                            .extend({
                                top: 0,
                                left: 0,
                                right: hasRightGap ? rightPadding : 0,
                                bottom: hasBottomGap ? bottomPadding : 0,
                            });

                        promises.push(
                            (async () => ({
                                name: `${fileNameWithoutExtension}_${addNumberPadding(
                                    row,
                                    numRows,
                                )}_${addNumberPadding(column, numColumns)}.${extension}`,
                                data: await rectangleImage.toBuffer(),
                            }))(),
                        );
                    } else {
                        const sharp = createSharpInstance(imgBuffer);
                        sharpInstances.push(sharp);
                        const rectangleImage = sharp.extract({
                            top: startY,
                            left: startX,
                            width: rectWidth,
                            height: rectHeight,
                        });

                        promises.push(
                            (async () => ({
                                name: `${fileNameWithoutExtension}_${addNumberPadding(
                                    row,
                                    numRows,
                                )}_${addNumberPadding(column, numColumns)}.${extension}`,
                                data: await rectangleImage.toBuffer(),
                            }))(),
                        );
                    }

                    if (promises.length === appConfigs.UPLOAD_BATCH_SIZE) {
                        const imageItems = await Promise.all(promises);

                        await Promise.all([
                            (async () => {
                                await Promise.all([
                                    createAnnotation(
                                        projectId,
                                        imageItemIndex,
                                        imageItemIndex + imageItems.length,
                                    ),
                                    updateProject(projectId, {
                                        $inc: { totalImages: imageItems.length },
                                    }),
                                ]);
                            })(),
                            (async () => {
                                await uploadImageItems(
                                    azureConfigs.STORAGE.PUBLIC_CONTAINER_NAME,
                                    projectId,
                                    imageItems,
                                );
                            })(),
                        ]);

                        imageItemIndex += imageItems.length;
                        promises = [];
                        sharpInstances.forEach((instance) => instance.destroy());
                        sharpInstances = [];
                    }
                }
            }

            // upload the rest
            if (promises.length > 0) {
                const imageItems = await Promise.all(promises);

                await Promise.all([
                    (async () => {
                        await Promise.all([
                            createAnnotation(
                                projectId,
                                imageItemIndex,
                                imageItemIndex + imageItems.length,
                            ),
                            updateProject(projectId, {
                                $inc: { totalImages: imageItems.length },
                            }),
                        ]);
                    })(),
                    (async () => {
                        await uploadImageItems(
                            azureConfigs.STORAGE.PUBLIC_CONTAINER_NAME,
                            projectId,
                            imageItems,
                        );
                    })(),
                ]);

                imageItemIndex += imageItems.length;
                promises = [];
                sharpInstances.forEach((instance) => instance.destroy());
                sharpInstances = [];
            }

            console.info(`Split and upload image ${fileName} successfully!`);
        }
    } catch (error) {
        console.error(`Project ${projectId} - Upload images error: ${error}`);
        await updateProject(projectId, {
            status: ProjectStatus.DRAFT,
        });
    }
};

export const downloadImageBuffer = async (
    container: string,
    filePath: string,
): Promise<Buffer> => {
    try {
        const blobServiceClient = BlobServiceClient.fromConnectionString(
            azureConfigs.STORAGE.CONNECTION_STRING,
        );

        const containerClient = blobServiceClient.getContainerClient(container);

        if (!(await containerClient.exists())) {
            throw new Error('Container not exists');
        }

        const blobClient = containerClient.getBlobClient(filePath);
        return blobClient.downloadToBuffer();
    } catch (error) {
        throw new Error(`Download error: ${error}`);
    }
};

const verifyFileBuffer = async ({
    projectId,
    fileBuffer,
}: {
    projectId: string;
    fileBuffer: Buffer;
}): Promise<void> => {
    const sharp = createSharpInstance(fileBuffer);
    const metadata = await sharp.metadata();
    const width = metadata.width || 0;
    const height = metadata.height || 0;
    sharp.destroy();

    if (
        fileBuffer.byteLength > appConfigs.IMAGE_MEMORY_SIZE_LIMIT ||
        width * height > appConfigs.IMAGE_DIMENSIONS_LIMIT
    ) {
        await updateProject(projectId, { status: ProjectStatus.DRAFT });
        throw new ProjectUpdateError(
            `Project ${projectId} - Upload image failed due to excess resources`,
        );
    }
};

const calculateImageTiles = async (
    fileBuffer: Buffer,
): Promise<{
    numRows: number;
    numColumns: number;
    width: number;
    height: number;
}> => {
    const { IMAGE_SIZE } = appConfigs;
    const sharp = createSharpInstance(fileBuffer);
    const { width, height, format } = await sharp.metadata();
    sharp.destroy();

    if (!format) {
        throw new Error('Missing image format');
    }

    if (!width || !height) {
        throw new Error('Cannot calculate the number of split images');
    }

    const [numColumns, numRows] = [width, height].map((num) =>
        Math.ceil(num / IMAGE_SIZE),
    );

    return { numRows, numColumns, width, height };
};

const createAnnotation = async (
    projectId: string,
    startImageIndex: number,
    endImageIndex: number,
): Promise<void> => {
    const { annotationClasses }: Project = await ProjectModel.findById({
        _id: projectId,
    }).select('annotationClasses');

    const operations = [];
    let imageIndex = startImageIndex;
    while (imageIndex < endImageIndex) {
        operations.push({
            updateOne: {
                filter: {
                    projectId,
                    imageIndex,
                },
                update: {
                    $set: {
                        imageIndex,
                        annotations: Array.from({ length: annotationClasses.length }, () =>
                            Buffer.from([]),
                        ),
                        lines: [],
                    },
                },
                upsert: true,
            },
        });

        imageIndex++;
    }

    if (operations.length) {
        await AnnotationModel.bulkWrite(operations);
    }

    return;
};

type ProjectUpdatePayload = Partial<
    Omit<Project, 'id' | 'createdAt' | 'updatedAt'>
> &
    UpdateQuery<Project>;

export const updateProject = async (
    projectId: string,
    payload: ProjectUpdatePayload,
): Promise<Project> => {
    const updatedProject = await ProjectModel.findOneAndUpdate(
        {
            _id: projectId,
        },
        payload,
        { new: true },
    );

    if (!updatedProject) {
        throw new ProjectNotFoundError(projectId);
    }

    return updatedProject;
};

const uploadImageItems = async (
    container: string,
    projectId: string,
    imageItems: ImageItem[],
): Promise<void> => {
    try {
        const blobServiceClient = BlobServiceClient.fromConnectionString(
            azureConfigs.STORAGE.CONNECTION_STRING,
        );

        const containerClient = blobServiceClient.getContainerClient(container);

        if (!(await containerClient.exists())) {
            await containerClient.create();
        }

        const uploadImage = (item: ImageItem) => {
            const blobClient = containerClient.getBlockBlobClient(
                `${projectId}/${item.name}`,
            );

            return blobClient.uploadData(item.data);
        };
        await promiseAllInBatches<ImageItem, unknown>(
            uploadImage,
            imageItems,
            appConfigs.UPLOAD_BATCH_SIZE,
        );
    } catch (error) {
        throw new Error(`Error: ${error}`);
    }
};
