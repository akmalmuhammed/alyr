import type {
  ExportCreateRequest,
  ExportStatusResponse,
  RenderedExport,
  Result
} from "@alyr/contracts";

export interface CloudExportCreateRequest extends ExportCreateRequest {
  readonly idempotencyKey: string;
}

/**
 * User-scoped cloud continuity export. Implementations never return provider
 * object keys or signed Storage URLs; ready bytes cross only the authenticated
 * API boundary and are integrity-checked again on the device.
 */
export interface CloudExportPort {
  create(
    request: CloudExportCreateRequest
  ): Promise<Result<ExportStatusResponse>>;
  get(exportId: string): Promise<Result<ExportStatusResponse>>;
  download(
    descriptor: ExportStatusResponse
  ): Promise<Result<RenderedExport>>;
}
