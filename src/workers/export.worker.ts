import type { ExportRequest, ExportResponse } from './export-protocol.ts';
import { createExportHandler } from './export-runner.ts';

/** Worker de exportación: valida y genera código, imágenes y GIF sin bloquear la interfaz. */

interface WorkerScope {
  postMessage(message: ExportResponse, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<ExportRequest>) => void) | null;
}

const scope = self as unknown as WorkerScope;
const handle = createExportHandler();

scope.onmessage = (event) => {
  const response = handle(event.data);
  const transfer =
    response.type === 'done' ? (response.outcome.files ?? []).map((f) => f.data.buffer) : [];
  scope.postMessage(response, transfer);
};
