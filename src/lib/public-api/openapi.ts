import {z} from 'zod';
import {OPERATIONS,OPERATION_IDS,type RestOperationId} from './operations';
import {responseSchemas,errorSchema} from './responses';
import {OPERATION_DOCS} from './operation-docs';
import {operationExamples} from './examples';
import {API_URL, MCP_URL, SITE_URL, documentationPath} from './discovery';
export function buildOpenApi() {
  const schemas:Record<string,unknown>={Error:z.toJSONSchema(errorSchema)};
  const paths:Record<string,unknown>={};
  const examples = operationExamples();
  for(const [name,op] of Object.entries(OPERATIONS)) {
    const id=name as RestOperationId;
    const input={...z.toJSONSchema(op.inputSchema,{io:'input'}), examples: examples[id].map(example => example.value)};
    const documentation = OPERATION_DOCS[id];
    schemas[`${id}Response`]=z.toJSONSchema(responseSchemas[id]);
    schemas[`${id}Request`]=input;
    const responses:Record<string,unknown>={
      '200':{description:'Success',headers:{'Request-Id':{schema:{type:'string'}},ETag:{schema:{type:'string'}}},content:{'application/json':{schema:{$ref:`#/components/schemas/${id}Response`}}}},
    };
    for(const [status,description] of Object.entries({'400':'Invalid request','404':'Not found','409':'Cursor expired','413':'Request too large','429':'Rate limited','500':'Internal error'})) {
      responses[status]={description,content:{'application/json':{schema:{$ref:'#/components/schemas/Error'}}}};
    }
    const properties=(input.properties??{}) as Record<string,Record<string,unknown>>;
    const parameters=Object.entries(properties).map(([key,schema])=>({name:key,in:op.path.includes(`{${key}}`)?'path':'query',required:op.path.includes(`{${key}}`),schema,
      ...(schema.description ? {description: schema.description} : {}),
      ...(examples[id][0].value[key] !== undefined ? {example: examples[id][0].value[key]} : {}),
      ...(schema.type==='array'?{style:'form',explode:key==='regions'}:{}),
    }));
    paths[op.path]={[op.method]:{operationId:id,summary:documentation.title,description:documentation.description,tags:[id==='create_estimate'?'Calculator':'Catalog'],
      externalDocs: {url: `${SITE_URL}${documentationPath(documentation.section)}`},
      ...(op.method==='post'?{requestBody:{required:true,content:{'application/json':{schema:{$ref:`#/components/schemas/${id}Request`},
        examples: Object.fromEntries(examples[id].map(example => [example.name, {summary: example.summary, value: example.value}]))}}}}:{parameters}),responses,
    }};
  }
  return {openapi:'3.1.0',info:{title:'CloudFinOps Public API',version:'1.0.0',description:'Public cloud pricing catalog for Russia and read-only monthly VM/GPU cost estimates. No API key is required. Catalog coverage includes compute, GPU, storage, networking, CDN, Kubernetes and AI; estimates support compute and GPU. Month = 720 hours. Compare only priced quotes; inspect matchedResource and differences. Capacity is not verified. Full usage guide: https://cloudfinops.ru/api/reference.md'},
    servers:[{url:API_URL}],security:[],
    externalDocs:{description:'API and MCP reference with runnable examples',url:`${SITE_URL}/api`},
    tags:[{name:'Catalog',description:'Discover providers, billing SKUs, price rules, regions and alternatives.'},{name:'Calculator',description:'Compare complete monthly compute and GPU estimates.'}],
    paths,components:{schemas},'x-mcp-tools':OPERATION_IDS,'x-mcp-url':MCP_URL};
}
