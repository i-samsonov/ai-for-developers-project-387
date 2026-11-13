import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const spec = JSON.parse(readFileSync('generated/@typespec/openapi3/openapi.json', 'utf8'))
const dir = 'server/generated'
mkdirSync(dir, { recursive: true })

// Fastify's Ajv schemas need local refs resolved. Keep the source of every
// constraint in TypeSpec rather than duplicating validation rules here.
function resolve(schema) {
  if (Array.isArray(schema)) return schema.map(resolve)
  if (schema && typeof schema === 'object') {
    if (schema.$ref) {
      const name = schema.$ref.replace('#/components/schemas/', '')
      if (!spec.components.schemas[name]) throw new Error(`Unknown schema: ${name}`)
      return resolve(spec.components.schemas[name])
    }
    return Object.fromEntries(Object.entries(schema).map(([key, value]) => [key, resolve(value)]))
  }
  return schema
}

const operations = Object.entries(spec.paths).flatMap(([url, methods]) =>
  Object.entries(methods).map(([method, operation]) => ({ url, method, operation })),
)
const typeName = (id) => id.replaceAll(/_([a-z])/g, (_, letter) => letter.toUpperCase())

const schemas = operations.map(({ operation }) => {
  const params = (location) => operation.parameters.filter((param) => param.in === location)
  const properties = (location) => Object.fromEntries(params(location).map((p) => [p.name, p.schema]))
  const parameterSchema = (location) => ({
    type: 'object',
    required: params(location).filter((p) => p.required).map((p) => p.name),
    properties: properties(location),
    additionalProperties: false,
  })
  return [operation.operationId, {
    ...(operation.requestBody ? { body: resolve(operation.requestBody.content['application/json'].schema) } : {}),
    ...(params('path').length ? { params: parameterSchema('path') } : {}),
    ...(params('query').length ? { querystring: parameterSchema('query') } : {}),
    response: Object.fromEntries(Object.entries(operation.responses).map(([status, response]) =>
      [status, resolve(response.content['application/json'].schema)])),
  }]
})

writeFileSync(`${dir}/schemas.ts`, `// Generated from api/main.tsp. Do not edit.\nexport const routeSchemas = ${JSON.stringify(Object.fromEntries(schemas), null, 2)} as const\n`)

// The SDK generator owns the TS model shapes; reuse them verbatim for the server.
writeFileSync(`${dir}/types.ts`, readFileSync('src/generated/sdk/types.gen.ts', 'utf8'))

const handlers = operations.map(({ operation }) => {
  const id = operation.operationId
  const type = typeName(id)
  return `  ${id}: (request: FastifyRequest<{ Body: ${type}Data['body']; Params: ${type}Data['path']; Querystring: ${type}Data['query'] }>, reply: FastifyReply) => ${type}Response | Promise<${type}Response>;`
}).join('\n')
const imports = operations.map(({ operation }) => {
  const type = typeName(operation.operationId)
  return `${type}Data, ${type}Response`
}).join(', ')
const routes = operations.map(({ url, method, operation }) =>
  `  app.${method}(${JSON.stringify(url.replaceAll('{', ':').replaceAll('}', ''))}, { schema: routeSchemas.${operation.operationId} }, handlers.${operation.operationId})`,
).join('\n')

writeFileSync(`${dir}/routes.ts`, `// Generated from api/main.tsp. Do not edit.\nimport type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'\nimport type { ${imports} } from './types.js'\nimport { routeSchemas } from './schemas.js'\n\nexport interface CalendarHandlers {\n${handlers}\n}\n\n/** Register only after supplying handwritten business handlers. */\nexport function registerCalendarRoutes(app: FastifyInstance, handlers: CalendarHandlers): void {\n${routes}\n}\n`)
