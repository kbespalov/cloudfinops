import {z} from 'zod';
import {OPERATIONS,OPERATION_IDS,type RestOperationId} from './operations';
import {responseSchemas,errorSchema} from './responses';
export function buildOpenApi() {
  const schemas:Record<string,unknown>={Error:z.toJSONSchema(errorSchema)};
  const paths:Record<string,unknown>={};
  for(const [name,op] of Object.entries(OPERATIONS)) {
    const id=name as RestOperationId;
    const input=z.toJSONSchema(op.inputSchema,{io:'input'});
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
      ...(schema.type==='array'?{style:'form',explode:false}:{}),
    }));
    paths[op.path]={[op.method]:{operationId:id,summary:op.description,tags:[id==='create_estimate'?'Calculator':'Catalog'],
      ...(op.method==='post'?{requestBody:{required:true,content:{'application/json':{schema:{$ref:`#/components/schemas/${id}Request`}}}}}:{parameters}),responses,
    }};
  }
  return {openapi:'3.1.0',info:{title:'CloudFinOps Public API',version:'1.0.0',description:'SKU catalog and stateless monthly estimates. Month = 720 hours. Exact categorical constraints; numeric sizes may increase. Only priced quotes enter lowestPriceProviderIds. Capacity is not verified.'},
    servers:[{url:'https://cloudfinops.ru/api/v1'}],paths,components:{schemas},'x-mcp-tools':OPERATION_IDS};
}
