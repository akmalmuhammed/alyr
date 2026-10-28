export const ControlType = new Proxy({}, { get: (_, k) => String(k) })
export function addPropertyControls() {}
export const RenderTarget = { canvas: "canvas", preview: "preview", current: () => "preview" }
