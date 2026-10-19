import type { Tool } from "../llm.ts";

export const setup_form_tool: Tool = {
  name: "show_setup_form",
  description: "Show the user a short form with only the fields needed for the next step",
  parameters: {
    type: "object",
    required: ["intent", "message", "fields"],
    properties: {
      intent: { type: "string", description: "Short snake_case label, e.g. weight_loss, event_dinner" },
      message: { type: "string", description: "One short sentence introducing the form. Do not list the fields." },
      fields: {
        type: "array",
        maxItems: 6,
        items: {
          type: "object",
          required: ["id", "label", "type", "required"],
          properties: {
            id: { type: "string" },
            label: { type: "string" },
            type: { type: "string", enum: ["text", "number", "single_choice", "multi_choice"] },
            required: { type: "boolean" },
            unit: { type: "string", description: "Only for number fields that have a unit; omit otherwise" },
            options: { type: "array", items: { type: "string" }, description: "Required for choice fields" },
          },
        },
      },
    },
  },
};