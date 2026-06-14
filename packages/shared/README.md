# @refx/shared

The canonical TypeScript **contract** shared across ReFx Hosting components.

| Module | Contents |
|--------|----------|
| `enums.ts` | String-union enums kept in lock-step with `database/prisma/schema.prisma` |
| `protocol.ts` | The panel ↔ node-agent WebSocket message envelope, types, and payloads |
| `permissions.ts` | The full list of per-server SubUser permission strings + `hasPermission()` |
| `dto.ts` | Common API DTO shapes (`Paginated<T>`, `ApiErrorBody`, `SwitchGameRequest`, `ServerInstallSpec`, …) |

## Usage

```ts
import { ServerState, MessageType, hasPermission } from '@refx/shared';
```

## Build

```bash
npm run build      # emits dist/ (ESM + .d.ts)
npm run typecheck
```

> Both `apps/web` and `apps/panel-api` currently carry local copies of the
> types they need; this package is the single source of truth they should be
> migrated onto. Keeping it green in CI guards against the enums drifting from
> the Prisma schema.
