import "server-only";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { createBearerClient } from "@/lib/supabase/bearer";
import { completePlannedWorkItem, createChatWorkItem, updateChatWorkItem } from "@/lib/work-planning";

type BearerClient = ReturnType<typeof createBearerClient>;

const propertySchema = z.object({
  id: z.string(),
  displayName: z.string(),
  propertyType: z.string(),
  city: z.string().nullable(),
  region: z.string().nullable(),
});

const workItemSchema = z.object({
  id: z.string(),
  propertyId: z.string(),
  propertyName: z.string(),
  reference: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  category: z.string().nullable(),
  area: z.string().nullable(),
  status: z.string(),
  priority: z.string(),
  workType: z.string(),
  targetStartOn: z.string().nullable(),
  targetEndOn: z.string().nullable(),
  updatedAt: z.string(),
});

const workTypeSchema = z.enum(["inspect", "maintain", "repair", "replace", "improve", "monitor", "other"]);
const prioritySchema = z.enum(["emergency", "urgent", "important", "routine", "informational"]);
const activeStatusSchema = z.enum(["inbox", "planned", "scheduled", "in_progress", "deferred", "rejected", "canceled"]);
const searchableStatusSchema = z.enum(["inbox", "planned", "scheduled", "in_progress", "completed", "deferred", "rejected", "canceled"]);

type WorkItemRow = {
  id: string;
  property_id: string;
  source_key: string | null;
  source_section: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  work_type: string;
  target_start_on: string | null;
  target_end_on: string | null;
  updated_at: string;
  properties: { display_name: string } | { display_name: string }[] | null;
  categories: { name: string } | { name: string }[] | null;
  areas: { name: string } | { name: string }[] | null;
};

function relationName(value: { name: string } | { name: string }[] | null) {
  return Array.isArray(value) ? value[0]?.name ?? null : value?.name ?? null;
}

function propertyName(value: WorkItemRow["properties"]) {
  return Array.isArray(value) ? value[0]?.display_name ?? "Unknown property" : value?.display_name ?? "Unknown property";
}

function mapWorkItem(row: WorkItemRow) {
  return {
    id: row.id,
    propertyId: row.property_id,
    propertyName: propertyName(row.properties),
    reference: row.source_section ?? row.source_key ?? row.id,
    title: row.title,
    description: row.description,
    category: relationName(row.categories),
    area: relationName(row.areas),
    status: row.status,
    priority: row.priority,
    workType: row.work_type,
    targetStartOn: row.target_start_on,
    targetEndOn: row.target_end_on,
    updatedAt: row.updated_at,
  };
}

function asToolResult(structuredContent: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(structuredContent, null, 2) }],
    structuredContent,
  };
}

function asToolError(error: unknown) {
  const message = error instanceof Error ? error.message : "Houser could not complete that request.";
  return { isError: true, content: [{ type: "text" as const, text: message }] };
}

async function findWorkItem(supabase: BearerClient, workItemId: string) {
  const { data, error } = await supabase
    .from("work_items")
    .select("id,property_id,source_key,source_section,title,description,status,priority,work_type,target_start_on,target_end_on,updated_at,properties(display_name),categories(name),areas(name)")
    .eq("id", workItemId)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("That Work item is not available to this Houser account.");
  return mapWorkItem(data as WorkItemRow);
}

export function createHouserMcpServer(supabase: BearerClient) {
  const server = new McpServer(
    { name: "houser", version: "0.1.0" },
    {
      instructions:
        "Houser is the source of truth for the user's properties and Work items. Read a Work item before changing it. Never create, update, or complete work without the user's explicit confirmation. Use complete_work_item—not update_work_item—when work actually happened.",
    },
  );

  server.registerTool(
    "list_properties",
    {
      title: "List Houser properties",
      description: "List the properties the signed-in Houser member can access. Use this to resolve a property before searching or creating work.",
      inputSchema: {},
      outputSchema: { properties: z.array(propertySchema) },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      try {
        const { data, error } = await supabase
          .from("properties")
          .select("id,display_name,property_type,city,region")
          .eq("is_archived", false)
          .order("display_name");
        if (error) throw new Error(error.message);
        return asToolResult({
          properties: (data ?? []).map((property) => ({
            id: property.id,
            displayName: property.display_name,
            propertyType: property.property_type,
            city: property.city,
            region: property.region,
          })),
        });
      } catch (error) {
        return asToolError(error);
      }
    },
  );

  server.registerTool(
    "search_work_items",
    {
      title: "Search Houser work",
      description: "Find Work items by words in their title, description, category, area, or property. Filters are optional; omitted statuses include current and historical work.",
      inputSchema: {
        query: z.string().trim().max(200).optional(),
        propertyId: z.string().uuid().optional(),
        statuses: z.array(searchableStatusSchema).max(8).optional(),
        limit: z.number().int().min(1).max(50).default(20),
      },
      outputSchema: { workItems: z.array(workItemSchema), totalMatched: z.number().int() },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ query, propertyId, statuses, limit }) => {
      try {
        let request = supabase
          .from("work_items")
          .select("id,property_id,source_key,source_section,title,description,status,priority,work_type,target_start_on,target_end_on,updated_at,properties(display_name),categories(name),areas(name)")
          .is("archived_at", null)
          .order("updated_at", { ascending: false })
          .limit(200);
        if (propertyId) request = request.eq("property_id", propertyId);
        if (statuses?.length) request = request.in("status", statuses);
        const { data, error } = await request;
        if (error) throw new Error(error.message);

        const needle = query?.trim().toLocaleLowerCase();
        const matched = (data ?? [])
          .map((row) => mapWorkItem(row as WorkItemRow))
          .filter((item) => !needle || [item.title, item.description, item.category, item.area, item.propertyName, item.reference]
            .some((value) => value?.toLocaleLowerCase().includes(needle)));
        return asToolResult({ workItems: matched.slice(0, limit), totalMatched: matched.length });
      } catch (error) {
        return asToolError(error);
      }
    },
  );

  server.registerTool(
    "get_work_item",
    {
      title: "Get a Houser Work item",
      description: "Read one Work item and its latest concurrency value before proposing or making a change.",
      inputSchema: { workItemId: z.string().uuid() },
      outputSchema: { workItem: workItemSchema },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ workItemId }) => {
      try {
        return asToolResult({ workItem: await findWorkItem(supabase, workItemId) });
      } catch (error) {
        return asToolError(error);
      }
    },
  );

  server.registerTool(
    "create_work_item",
    {
      title: "Create a Houser Work item",
      description: "Create a Work item only after the user explicitly confirms the proposed property, title, category, area, priority, status, and timing.",
      inputSchema: {
        propertyId: z.string().uuid(),
        title: z.string().trim().min(1).max(240),
        description: z.string().trim().max(5000).default(""),
        category: z.string().trim().min(1).max(100),
        area: z.string().trim().min(1).max(120),
        workType: workTypeSchema.default("other"),
        status: activeStatusSchema.default("inbox"),
        priority: prioritySchema.default("routine"),
        targetStartOn: z.iso.date().nullable().default(null),
        targetEndOn: z.iso.date().nullable().default(null),
        note: z.string().trim().max(5000).default("Created through the Houser plugin after user confirmation."),
      },
      outputSchema: { workItem: workItemSchema },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (input) => {
      try {
        const workItem = await createChatWorkItem(supabase, {
          type: "create_work_item",
          summary: `Create ${input.title}`,
          ...input,
        });
        return asToolResult({ workItem: { ...workItem, propertyName: (await findWorkItem(supabase, workItem.id)).propertyName } });
      } catch (error) {
        return asToolError(error);
      }
    },
  );

  server.registerTool(
    "update_work_item",
    {
      title: "Update a Houser Work item",
      description: "Update a current Work item only after reading it and receiving explicit user confirmation. Pass the exact updatedAt value returned by get_work_item. This tool cannot mark work completed.",
      inputSchema: {
        workItemId: z.string().uuid(),
        expectedUpdatedAt: z.string().datetime({ offset: true }),
        summary: z.string().trim().min(1).max(500),
        title: z.string().trim().min(1).max(240).nullable().default(null),
        description: z.string().trim().max(5000).nullable().default(null),
        category: z.string().trim().min(1).max(100).nullable().default(null),
        area: z.string().trim().min(1).max(120).nullable().default(null),
        workType: workTypeSchema.nullable().default(null),
        status: activeStatusSchema.nullable().default(null),
        priority: prioritySchema.nullable().default(null),
        targetStartOn: z.iso.date().nullable().default(null),
        targetEndOn: z.iso.date().nullable().default(null),
        note: z.string().trim().max(5000).default("Updated through the Houser plugin after user confirmation."),
      },
      outputSchema: { workItem: workItemSchema },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (input) => {
      try {
        const workItem = await updateChatWorkItem(supabase, { type: "update_work_item", ...input });
        return asToolResult({ workItem: await findWorkItem(supabase, workItem.id) });
      } catch (error) {
        return asToolError(error);
      }
    },
  );

  server.registerTool(
    "complete_work_item",
    {
      title: "Complete a Houser Work item",
      description: "Record work that actually happened and preserve service history. Call only after reading the Work item and the user explicitly confirms the completion details.",
      inputSchema: {
        workItemId: z.string().uuid(),
        expectedUpdatedAt: z.string().datetime({ offset: true }),
        performedOn: z.iso.date(),
        vendorName: z.string().trim().max(200).default(""),
        cost: z.string().regex(/^$|^\d+(?:\.\d{1,2})?$/).default(""),
        note: z.string().trim().max(5000).default(""),
        warrantyEndsOn: z.union([z.literal(""), z.iso.date()]).default(""),
        recurrenceMonths: z.number().int().min(1).max(1200).nullable().default(null),
      },
      outputSchema: {
        workItem: workItemSchema,
        serviceRecordId: z.string(),
        nextServiceOn: z.string().nullable(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (input) => {
      try {
        const current = await findWorkItem(supabase, input.workItemId);
        if (current.updatedAt !== input.expectedUpdatedAt) {
          throw new Error("That Work item changed since it was reviewed. Read it again before completing it.");
        }
        if (current.status === "completed") throw new Error("That Work item is already completed.");
        const result = await completePlannedWorkItem(supabase, {
          workItemId: input.workItemId,
          reportId: current.reference,
          performedOn: input.performedOn,
          vendorName: input.vendorName,
          cost: input.cost,
          note: input.note,
          warrantyEndsOn: input.warrantyEndsOn,
          recurrenceMonths: input.recurrenceMonths,
        });
        return asToolResult({
          workItem: await findWorkItem(supabase, input.workItemId),
          serviceRecordId: result.serviceRecord.id,
          nextServiceOn: result.nextServiceOn,
        });
      } catch (error) {
        return asToolError(error);
      }
    },
  );

  return server;
}
