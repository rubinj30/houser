---
name: use-houser
description: Use the Houser MCP tools when the user asks about their properties, maintenance, repairs, Work items, status, priority, timing, or service completion.
---

# Use Houser

Use Houser as the source of truth for the user's private home-maintenance records.

## Read workflow

1. Call `list_properties` when the property is not already unambiguous.
2. Use `search_work_items` to resolve relevant records.
3. Call `get_work_item` before presenting exact details or preparing a change.
4. Clearly distinguish current work from completed, rejected, or canceled history.
5. Say when Houser has no trusted date or record instead of inventing one.

## Write workflow

- Never create, edit, or complete a Work item unless the user explicitly asked for the change and confirmed the proposed values.
- Before `update_work_item`, call `get_work_item` and pass its exact `updatedAt` value as `expectedUpdatedAt`.
- Before `complete_work_item`, call `get_work_item`, pass its exact `updatedAt` value as `expectedUpdatedAt`, and confirm that the work actually happened. Do not mark work completed with `update_work_item`.
- If the property or Work item is ambiguous, ask a concise follow-up question.
- Do not use a delete operation; this plugin intentionally exposes none.
