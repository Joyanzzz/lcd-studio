import type { ProjectRequest, ProjectResponse } from './project-protocol.ts';
import { createProjectHandler } from './project-runner.ts';

/** Worker de proyectos: abrir y guardar sin bloquear la interfaz. */

interface WorkerScope {
  postMessage(message: ProjectResponse, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<ProjectRequest>) => void) | null;
}

const scope = self as unknown as WorkerScope;

const handle = createProjectHandler();

scope.onmessage = (event) => {
  const { response, transfer } = handle(event.data);
  scope.postMessage(response, transfer);
};
