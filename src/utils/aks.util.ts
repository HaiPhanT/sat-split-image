import axios, { AxiosError } from 'axios';
import { appConfigs, azureConfigs } from '../configs';
import * as k8s from '@kubernetes/client-node';
import * as stream from 'stream';
import { sleep } from './promise.util';

const cluster = {
  name: azureConfigs.AKS.CLUSTER_NAME,
  server: azureConfigs.AKS.CLUSTER_SERVER,
  caData: azureConfigs.AKS.CLUSTER_CA_DATA,
};

const user = {
  name: azureConfigs.AKS.USER_NAME,
  token: azureConfigs.AKS.TOKEN,
  certData: azureConfigs.AKS.CERT_DATA,
  keyData: azureConfigs.AKS.KEY_DATA,
};

const context = {
  name: cluster.name,
  user: user.name,
  cluster: cluster.name,
};

const kc = new k8s.KubeConfig();
kc.loadFromOptions({
  clusters: [cluster],
  users: [user],
  contexts: [context],
  currentContext: context.name,
});

export enum AKSPodStatus {
  Pending = 'Pending',
  Running = 'Running',
  Succeeded = 'Succeeded',
  Completed = 'Completed',
  Failed = 'Failed',
  Error = 'Error',
  Terminating = 'Terminating',
  Unknown = 'Unknown',
}

const FINISHED_STATUSES = [
  AKSPodStatus.Succeeded,
  AKSPodStatus.Completed,
  AKSPodStatus.Failed,
  AKSPodStatus.Error,
  AKSPodStatus.Terminating,
  AKSPodStatus.Unknown,
];

const RUNNING_STATUSES = [AKSPodStatus.Running];

const axiosClient = azureConfigs.AKS.TOKEN
  ? axios.create({
      baseURL: azureConfigs.AKS.PREFIX,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${azureConfigs.AKS.TOKEN}`,
        Accept: 'application/json',
      },
    })
  : null;

const formatAKSName = (id: string) =>
  id.startsWith('sat-project-') ? id : `sat-project-${id}`;

export const getAKSPod = async (id: string) => {
  if (!axiosClient) {
    return null;
  }
  try {
    const name = formatAKSName(id);
    const { data } = await axiosClient.get(`/pods/${name}`);

    return data;
  } catch (error) {
    const axiosError = error as AxiosError;

    switch (axiosError.response?.status) {
      case 404:
        return null;
      default:
        throw error;
    }
  }
};

export const createAKSPod = async (
  id: string,
  extraEnv: Array<{ name: string; value: string }> = [],
) => {
  if (!axiosClient) {
    return null;
  }

  const name = formatAKSName(id);
  const { data } = await axiosClient.post('/pods', {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name },
    spec: {
      containers: [
        {
          name,
          image: azureConfigs.AKS.TRAINING_IMAGE,
          resources: {
            requests: {
              memory: '1Gi',
            },
          },
          env: [
            {
              name: 'AZURE_STORAGE_CONNECTION_STRING',
              value: azureConfigs.STORAGE.CONNECTION_STRING,
            },
            {
              name: 'AZURE_STORAGE_CONNECTION_TIMEOUT',
              value: azureConfigs.STORAGE.CONNECTION_TIMEOUT.toString(),
            },
            {
              name: 'AZURE_DATASET_CONTAINER_NAME',
              value: azureConfigs.STORAGE.DATASET_CONTAINER_NAME,
            },
            {
              name: 'AZURE_PUBLIC_CONTAINER_NAME',
              value: azureConfigs.STORAGE.PUBLIC_CONTAINER_NAME,
            },
            {
              name: 'AZURE_ORIGINAL_CONTAINER_NAME',
              value: azureConfigs.STORAGE.ORIGINAL_CONTAINER_NAME,
            },
            {
              name: 'AZURE_IMPORT_MODEL_CONTAINER_NAME',
              value: azureConfigs.STORAGE.IMPORT_MODEL_CONTAINER_NAME,
            },
            {
              name: 'AZURE_EXPORT_MODEL_CONTAINER_NAME',
              value: azureConfigs.STORAGE.EXPORT_MODEL_CONTAINER_NAME,
            },
            {
              name: 'AZURE_SERVICE_BUS_CONNECTION_STRING',
              value: azureConfigs.SERVICE_BUS.CONNECTION_STRING,
            },
            {
              name: 'AZURE_WEB_PUB_SUB_SERVICE_CONNECTION_STRING',
              value: azureConfigs.WEB_PUB_SUB.CONNECTION_STRING,
            },
            {
              name: 'AZURE_WEB_PUB_SUB_SERVICE_HUB_NAME',
              value: azureConfigs.WEB_PUB_SUB.HUB_NAME,
            },
            { name: 'PROJECT_ID', value: id },
            { name: 'BACKEND_URL', value: appConfigs.BACKEND_URI },
            ...extraEnv,
          ],
        },
      ],
      nodeSelector: { type: 'gpu' },
      restartPolicy: 'Never',
      imagePullSecrets: [{ name: azureConfigs.AKS.TRAINING_IMAGE_SECRET }],
    },
  });

  return data;
};

export const deleteAKSPod = async (id: string) => {
  try {
    if (!axiosClient) {
      return;
    }

    const name = formatAKSName(id);
    await axiosClient.delete(`/pods/${name}`);
  } catch (error) {
    if ((error as AxiosError).response?.status === 404) {
      return;
    } else {
      throw new Error(`Delete AKS pod error: ${error}`);
    }
  }
};

export const createOrUpdateAKSPod = async (
  id: string,
  extraEnv: Array<{ name: string; value: string }> = [],
) => {
  if (!axiosClient) {
    return null;
  }

  const pod = await getAKSPod(id);

  if (pod && !FINISHED_STATUSES.includes(pod.status.phase)) {
    return pod;
  }

  if (pod) {
    await deleteAKSPod(id);
  }

  return createAKSPod(id, extraEnv);
};

export enum AKS_SCRIPT {
  INFERENCE = 'scripts/inference.py',
}

export enum INFERENCE_ACTION_TYPE {
  PREDICT = 'predict',
  SUGGEST = 'suggest',
  CALCULATE = 'calculate',
}

export const execScript = async (
  id: string,
  script: AKS_SCRIPT,
  actionType: INFERENCE_ACTION_TYPE,
  args: string[] = [],
  callbackFn: (status: k8s.V1Status) => void = () => {},
  options?: {
    forceRunPod?: boolean;
    initTraining?: boolean;
    onFinish?: () => Promise<void>;
  },
) => {
  const { forceRunPod = false, initTraining = true, onFinish } = options ?? {};

  const pod = await getAKSPod(id);

  if (
    !forceRunPod &&
    (!pod || !RUNNING_STATUSES.includes(pod?.status?.phase))
  ) {
    return;
  }

  if (forceRunPod && (!pod || !RUNNING_STATUSES.includes(pod?.status?.phase))) {
    await createOrUpdateAKSPod(id, [
      {
        name: 'INIT_TRAINING',
        value: initTraining ? 'TRUE' : 'FALSE',
      },
    ]);

    // * Wait for pod to be running
    let retryLimit = 15;
    let _pod = await getAKSPod(id);
    let _podRunning = RUNNING_STATUSES.includes(_pod.status.phase);

    while (retryLimit >= 0 && !_podRunning) {
      await sleep(1000);
      retryLimit--;

      _pod = await getAKSPod(id);
      if (!_pod) continue;
      _podRunning = RUNNING_STATUSES.includes(_pod.status.phase);
    }

    if (!_podRunning) {
      return;
    }
  }

  const podName = formatAKSName(id);
  const command = ['python3.10', script, actionType];

  if (args.length) {
    command.push(args.join(','));
  }

  console.info(`Start exec ${actionType} for ${id}`);
  const executor = new k8s.Exec(kc);
  await executor.exec(
    azureConfigs.AKS.NAMESPACE,
    podName,
    '',
    command,
    process.stdout as stream.Writable,
    process.stderr as stream.Writable,
    process.stdin as stream.Readable,
    true /* tty */,
    callbackFn,
  );

  onFinish && (await onFinish());
};
