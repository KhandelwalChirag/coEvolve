import { z } from "zod"
import { zodToJsonSchema } from "zod-to-json-schema"

function parse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function text(parts: Array<{ type?: string; text?: string }> | undefined): string {
  if (!parts) return ""
  return parts
    .filter(x => x.type === "text" && typeof x.text === "string")
    .map(x => x.text as string)
    .join("\n")
}

export async function askJSON<T extends z.ZodType>(input: {
  client?: any
  directory?: string
  title: string
  prompt: string
  schema: T
}): Promise<z.infer<T> | null> {
  if (!input.client) return null

  const created = await input.client.session.create({
    directory: input.directory,
    title: input.title,
  })

  const id = created.data?.id
  if (created.error || !id) return null

  const schema = zodToJsonSchema(input.schema)
  const sent = await input.client.session.prompt({
    sessionID: id,
    directory: input.directory,
    format: {
      type: "json_schema",
      schema,
      retryCount: 1,
    },
    noReply: false,
    parts: [{ type: "text", text: input.prompt }],
  })

  await input.client.session.delete({ sessionID: id, directory: input.directory })

  if (sent.error || !sent.data) return null

  const data = sent.data.info?.structured ?? parse(text(sent.data.parts))
  const parsed = input.schema.safeParse(data)
  if (!parsed.success) return null
  return parsed.data
}
