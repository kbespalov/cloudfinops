import {z} from 'zod';
import {listAttributes} from './attributes';
import {listAlternatives} from './alternatives';
import {getProvider,listCategories,listProducts,listProviders,listRegions,listServices} from './catalog';
import {createEstimate} from './estimates';
import {findMeterByProductId,meterToProduct} from './product';
import {estimateRequestSchema,productQuerySchema,productIdSchema,emptySchema,attributeQuerySchema,validationDetails} from './schemas';
import {successBody} from './envelope';
import {CALCULATION_VERSION} from './constants';

export const OPERATION_IDS = ['list_providers','search_products','get_product','list_product_alternatives','create_estimate'] as const;
export type OperationId = typeof OPERATION_IDS[number];
function notFound(message:string):never { throw Object.assign(new Error(message),{apiCode:'not_found'}); }
function product(id:string) { return findMeterByProductId(id) ?? notFound('Product not found'); }
const list = (data:unknown[]) => successBody(data,undefined,{nextCursor:null,limit:data.length});
function operation<S extends z.ZodType>(path:string,method:'get'|'post',description:string,inputSchema:S,run:(input:z.output<S>)=>unknown) {
  return {path,method,description,inputSchema,execute:(input:unknown)=>run(inputSchema.parse(input))};
}
/** Shared by REST dispatch, MCP registration, and OpenAPI generation. */
export const OPERATIONS = {
  list_providers:operation('/providers','get','Провайдеры и покрытие каталога.',emptySchema,()=>list(listProviders())),
  get_provider:operation('/providers/{id}','get','Провайдер по slug.',z.strictObject({id:z.string().min(1)}),({id})=>successBody(getProvider(id)??notFound('Provider not found'))),
  list_categories:operation('/categories','get','Категории SKU.',emptySchema,()=>list(listCategories())),
  list_attributes:operation('/attributes','get','Характеристики по категориям: типы, операции, допустимые и наблюдаемые значения.',attributeQuerySchema,({categories})=>list(listAttributes(undefined,categories))),
  list_services:operation('/services','get','Сервисы каталога, категории и типы биллинговых тарифов.',emptySchema,()=>list(listServices())),
  list_regions:operation('/regions','get','Исходные метки регионов, все распознанные коды и число SKU с точной меткой.',emptySchema,()=>list(listRegions())),
  search_products:operation('/products','get','SKU: фильтры по характеристикам из реестра, категории, сервису и единице тарификации; необязательный текстовый поиск и cursor.',productQuerySchema,(input)=>{
    const result=listProducts(input);return successBody(result.items,undefined,{nextCursor:result.nextCursor,limit:result.limit});
  }),
  get_product:operation('/products/{id}','get','Product и правила тарификации Price.',productIdSchema,({id})=>successBody(meterToProduct(product(id)))),
  list_product_alternatives:operation('/products/{id}/alternatives','get','Сопоставимые SKU; цены сравнимы только при priceComparable=true.',productIdSchema,({id})=>list(listAlternatives(product(id)))),
  create_estimate:operation('/estimates','post','Compute/GPU за 720 часов. Сравнивайте только priced; capacityVerified=false.',estimateRequestSchema,(input)=>successBody(createEstimate(input),{calculationVersion:CALCULATION_VERSION})),
};
export type RestOperationId=keyof typeof OPERATIONS;
export type OperationResult={ok:true;data:unknown}|{ok:false;code:string;message:string;details:Array<{path:string;code:string}>};
export function runOperation(id:RestOperationId,input:unknown):OperationResult {
  try { return {ok:true,data:OPERATIONS[id].execute(input)}; }
  catch(error) {
    if(error instanceof z.ZodError) return {ok:false,code:'invalid_parameter',message:'Invalid request',details:validationDetails(error)};
    const e=error as {apiCode?:string;name?:string;message?:string;details?:Array<{path:string;code:string}>};
    const code=e.apiCode??(e.name==='EstimateValidationError'?'invalid_parameter':'internal_error');
    return {ok:false,code,message:code==='internal_error'?'Internal API error':e.message??'Invalid request',details:e.details??[]};
  }
}
export {getProvider,listCategories,listRegions};
