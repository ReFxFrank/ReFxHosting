/**
 * @refx/shared — canonical contract shared across ReFx Hosting components.
 *
 * Re-exports enums (mirroring schema.prisma), the panel↔agent WebSocket
 * protocol, per-server permission strings, and common DTO shapes.
 */
export * from './enums.js';
export * from './protocol.js';
export * from './permissions.js';
export * from './dto.js';
