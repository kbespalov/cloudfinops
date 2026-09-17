import {catalog, extractDiskMedia, extractGpuInterconnect, extractGpuModel, type CatalogData, type CatalogMeter} from '@/lib/catalog';
import {availableVmTypesOf, envelopeFieldsOf, meterAllowsShape} from '@/lib/calculator/compute-shapes';
import {extractTrafficRoute} from '@/lib/catalog/peer-match';
import {isConfirmedAvailable, isSharedVcpu} from '@/lib/calculator/quote';
import {MONTH_HOURS} from './constants';
import {productId, priceId} from './ids';
import {meterToPrice, regionCode} from './product';
import {priceLine} from './price-engine';
import {compareAmounts, parseDecimal, sumAmounts, toMoney} from './money';
import {estimateRequestSchema, validationDetails} from './schemas';
import type {EstimateRequest, EstimateResource, EstimateResult, EstimateLineItem, ProviderQuote, QuoteReason, DiskSpec} from './types';

export class EstimateValidationError extends Error {
  constructor(message: string, public details: Array<{path: string; code: string; value?: unknown}>) {
    super(message); this.name = 'EstimateValidationError';
  }
}
export function validateEstimateRequest(body: unknown): EstimateRequest {
  const result = estimateRequestSchema.safeParse(body);
  if (!result.success) throw new EstimateValidationError('Invalid estimate request', validationDetails(result.error));
  const parsed = result.data;
  if (parsed.resource.type === 'gpu' && parsed.resource.scope === 'gpu_only' &&
      (parsed.resource.vcpu != null || parsed.resource.memoryGiB != null || parsed.resource.disk != null)) {
    throw new EstimateValidationError('gpu_only cannot include host resources', [{path: '/resource/scope', code: 'incompatible_fields'}]);
  }
  if (parsed.resource.type === 'gpu' && parsed.resource.scope === 'instance') parsed.resource.disk ??= {sizeGiB: 100, media: 'ssd'};
  return parsed;
}

type Part = {role: string; meter: CatalogMeter; quantity: number};
type Candidate = {parts: Part[]; matched: Record<string, unknown>; reason?: QuoteReason};
const why = (code: string, message: string, path = '/resource'): QuoteReason => ({code, message, path});
const num = (value: unknown): number | undefined => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
const cpuOf = (m: CatalogMeter) => num(m.dimensions.vcpu);
const ramOf = (m: CatalogMeter) => num(m.dimensions.ramGiB ?? m.dimensions.ramGb);
const purchase = (m: CatalogMeter) => String(m.purchaseModel ?? m.dimensions.purchaseModel ?? 'on-demand');
const usable = (m: CatalogMeter) => m.status === 'available' && !m.synthetic && isConfirmedAvailable(m);
const sameRegion = (a: CatalogMeter, b: CatalogMeter) => a.region === b.region;
const matchesRegion = (m: CatalogMeter, region?: string) => !region || m.region === region || regionCode(m.region) === region;
const platform = (m: CatalogMeter) => m.cpuPlatformFamily ?? String(m.dimensions.cpuPlatformFamily ?? '');
const compatible = (a: CatalogMeter, b: CatalogMeter) => sameRegion(a,b) && (!platform(a) || !platform(b) || platform(a) === platform(b));
const gpuPlatform = (m: CatalogMeter) => String(m.dimensions.gpuPlatformId ?? m.dimensions.platformId ?? '');
const bundle = (m: CatalogMeter) => m.pricingMode === 'bundle' || m.unitQuantity === 'flavor';

function minimumShapes(m: CatalogMeter, vcpu: number, memoryGiB: number, gpuHost = false) {
  const types = availableVmTypesOf(m);
  const env = envelopeFieldsOf(m);
  const ram = Math.max(memoryGiB, gpuHost ? 0 : env.minRamGiB ?? 0);
  const cpu = Math.max(vcpu, gpuHost ? 0 : env.minVcpu ?? 0,
    !gpuHost && env.maxRamGiBPerVcpu ? Math.ceil(ram / env.maxRamGiBPerVcpu) : 0);
  return (types.length ? types.map(t => ({vcpu: t.vcpu, memoryGiB: t.ramGiB})) : [{vcpu: cpu, memoryGiB: ram}])
    .filter(s => s.vcpu >= vcpu && s.memoryGiB >= memoryGiB && meterAllowsShape(m, s.vcpu, s.memoryGiB, {ignoreEnvelope: gpuHost}));
}

function addDisk(c: Candidate, rows: CatalogMeter[], base: CatalogMeter, disk: DiskSpec | undefined): Candidate[] {
  if (!disk) return [c];
  const included = num(base.dimensions.diskGiB ?? base.dimensions.diskGb) ?? 0;
  const includedMedia = String(base.dimensions.diskMedia ?? base.dimensions.storageMedia ?? '').toLowerCase();
  if (included >= disk.sizeGiB && (includedMedia === disk.media || disk.media === 'ssd' && includedMedia === 'nvme')) {
    return [{...c, matched: {...c.matched, disk: {sizeGiB: included, media: disk.media}}}];
  }
  const disks = rows.filter(m => m.meter === 'storage.block.capacity' && sameRegion(m, base) &&
    !/nonreplic|non-replic/i.test(String(m.dimensions.diskType ?? '') + String(m.dimensions.redundancy ?? '')) &&
    (m.dimensions.iopsChargedSeparately !== true || num(m.dimensions.includedIops) != null) &&
    (disk.media === 'hdd' ? extractDiskMedia(m) === 'HDD' : ['SSD','NVMe'].includes(extractDiskMedia(m) ?? '')));
  if (!disks.length) return [{...c, reason: why('disk_price_missing', 'В каталоге нет ставки запрошенного диска в регионе конфигурации.', '/resource/disk')}];
  return disks.map(m => {
    const min = num(m.dimensions.minSizeGiB) ?? 0;
    const step = num(m.dimensions.sizeStepGiB) ?? 1;
    const sizeGiB = Math.ceil(Math.max(disk.sizeGiB, min) / step) * step;
    return {...c, matched: {...c.matched, disk: {sizeGiB, media: disk.media, ...(m.dimensions.iopsChargedSeparately === true ? {includedIops: num(m.dimensions.includedIops)} : {})}}, parts: [...c.parts, {role: 'disk', meter: m, quantity: sizeGiB}]};
  });
}

function computeCandidates(rows: CatalogMeter[], vcpu: number, memoryGiB: number, disk: DiskSpec | undefined,
  preference: string, gpu?: CatalogMeter): Candidate[] {
  const eligible = (m: CatalogMeter) => purchase(m) === preference && !isSharedVcpu(m) &&
    (gpu ? compatible(gpu, m) && (!gpuPlatform(gpu) || gpuPlatform(m) === gpuPlatform(gpu)) : !m.dimensions.gpuHostOnly);
  const out: Candidate[] = [];
  for (const m of rows.filter(m => m.meter === 'compute.flavor' && m.categoryKey === 'compute' && eligible(m))) {
    const cpu = cpuOf(m), ram = ramOf(m);
    if (!cpu || !ram || cpu < vcpu || ram < memoryGiB || !meterAllowsShape(m, cpu, ram, {ignoreEnvelope: Boolean(gpu)})) continue;
    out.push(...addDisk({parts: [{role: 'bundle', meter: m, quantity: 1}], matched: {vcpu: cpu, memoryGiB: ram, region: m.region}}, rows, m, disk));
  }
  for (const cpu of rows.filter(m => m.meter === 'compute.vcpu' && eligible(m))) {
    for (const ram of rows.filter(m => m.meter === 'compute.ram' && purchase(m) === preference && compatible(cpu,m) &&
      (gpu ? (!gpuPlatform(gpu) || gpuPlatform(m) === gpuPlatform(gpu)) : !m.dimensions.gpuHostOnly))) {
      for (const shape of minimumShapes(cpu, vcpu, memoryGiB, Boolean(gpu))) {
        if (!meterAllowsShape(ram, shape.vcpu, shape.memoryGiB, {ignoreEnvelope: Boolean(gpu)})) continue;
        out.push(...addDisk({parts: [
          {role: 'vcpu', meter: cpu, quantity: shape.vcpu}, {role: 'ram', meter: ram, quantity: shape.memoryGiB},
        ], matched: {...shape, region: cpu.region}}, rows, cpu, disk));
      }
    }
  }
  return out;
}

function modelMatches(m: CatalogMeter, wanted: string) {
  const normalized = (value: string) => value.toLowerCase().replace(/\bnvidia\b/g,'').replace(/[^a-z0-9]+/g,' ').trim();
  if ((m.dimensions.virtualGpu === true || /vgpu/i.test(m.name)) && !/vgpu/i.test(wanted)) return false;
  const candidate = normalized(extractGpuModel(m) ?? '');
  const needle = normalized(wanted);
  return candidate === needle || (` ${candidate} `).includes(` ${needle} `);
}
function gpuCandidates(rows: CatalogMeter[], r: Extract<EstimateResource,{type:'gpu'}>): Candidate[] {
  const out: Candidate[] = [];
  for (const gpu of rows.filter(m => m.categoryKey === 'gpu' && modelMatches(m,r.gpuModel) && purchase(m) === r.purchaseModel &&
    (!r.interconnect || (extractGpuInterconnect(m) ?? '').toLowerCase() === r.interconnect.toLowerCase()) &&
    (!r.form || String(m.dimensions.gpuForm ?? m.dimensions.formFactor ?? '').toLowerCase() === r.form.toLowerCase()))) {
    const count = num(gpu.dimensions.gpuCount) ?? 1;
    const base = {type: 'gpu', gpuModel: extractGpuModel(gpu), interconnect: extractGpuInterconnect(gpu),
      form: gpu.dimensions.gpuForm ?? gpu.dimensions.formFactor ?? null, region: gpu.region};
    if (bundle(gpu)) {
      if (r.scope === 'gpu_only' || count < r.gpuCount) continue;
      const cpu = cpuOf(gpu), ram = ramOf(gpu);
      if (!cpu || !ram) { out.push({parts: [], matched: {...base, gpuCount: count}, reason: why('host_shape_unknown','В каталоге не описан состав GPU bundle.')}); continue; }
      if (cpu < (r.vcpu ?? 0) || ram < (r.memoryGiB ?? 0)) continue;
      out.push(...addDisk({parts: [{role:'bundle',meter:gpu,quantity:1}], matched: {...base,gpuCount:count,vcpu:cpu,memoryGiB:ram}},rows,gpu,r.disk));
      continue;
    }
    const counts = Array.isArray(gpu.dimensions.availableGpuCounts) ? gpu.dimensions.availableGpuCounts.map(Number).filter(n => n >= r.gpuCount && n % count === 0) : [Math.ceil(r.gpuCount / count) * count];
    if (!counts.length) continue;
    for (const actualCount of counts) {
      const part: Part = {role:'gpu',meter:gpu,quantity:actualCount/count};
      const matched = {...base,gpuCount:actualCount};
      if (r.scope === 'gpu_only') { out.push({parts:[part],matched}); continue; }
      const rawHosts = gpu.dimensions.hostConfigs ?? gpu.dimensions.availableVmTypes;
      const hosts = Array.isArray(rawHosts) ? rawHosts as Record<string,unknown>[] : [];
      const shapes = hosts.filter(h => Number(h.gpuCount) === actualCount).map(h => ({vcpu:Number(h.vcpu),memoryGiB:Number(h.ramGiB??h.ramGb)}))
        .filter(h => h.vcpu >= (r.vcpu ?? 0) && h.memoryGiB >= (r.memoryGiB ?? 0));
      // Only explicit host metadata or a complete caller-supplied shape can be priced.
      if (!hosts.length && r.vcpu && r.memoryGiB) shapes.push({vcpu:r.vcpu,memoryGiB:r.memoryGiB});
      if (!shapes.length) {
        if (!hosts.length) out.push({parts:[part],matched,reason:why('host_shape_unknown','В каталоге нет формы хоста: задайте vcpu и memoryGiB.')});
        continue;
      }
      for (const shape of shapes) {
        const hosts = computeCandidates(rows,shape.vcpu,shape.memoryGiB,r.disk,r.purchaseModel ?? 'on-demand',gpu)
          .filter(h => h.matched.vcpu === shape.vcpu && h.matched.memoryGiB === shape.memoryGiB);
        if (!hosts.length) out.push({parts:[part],matched:{...matched,...shape},reason:why('host_price_missing','В каталоге нет совместимых ставок CPU/RAM для GPU-хоста.')});
        for (const host of hosts) out.push({...host,parts:[part,...host.parts],matched:{...matched,...host.matched}});
      }
    }
  }
  return out;
}

function line(part: Part): EstimateLineItem | QuoteReason {
  const price = meterToPrice(part.meter), result = priceLine(part.meter,part.quantity);
  if ('error' in result) return why(result.error === 'vat' ? 'vat_unknown' : 'price_missing',
    `Нет полной ставки included RUB для ${part.role} (${result.error}).`, `/resource/${part.role}`);
  return {role:part.role,productId:productId(part.meter.provider,part.meter.sku),priceId:priceId(part.meter),
    quantity:result.quantity,amount:result.amount,label:part.meter.name,vat:price.vat,unit:price.unit};
}
function addAddons(c: Candidate, rows: CatalogMeter[], request: EstimateRequest): Candidate {
  const specs = [
    ['publicIpCount','ip','network.ipv4.attached'], ['objectStorageGiB','storage','storage.object.capacity'],
    ['internetEgressGiB','egress','network.traffic.egress'], ['cdnEgressGiB','cdn','cdn.traffic.egress'],
  ] as const;
  const result = {...c,parts:[...c.parts]};
  for (const [key,role,meterId] of specs) {
    const quantity = request.addons?.[key] ?? 0;
    if (!quantity) continue;
    const choices = rows.filter(m => m.meter === meterId && (!request.resource.region || matchesRegion(m,request.resource.region)) &&
      (key !== 'publicIpCount' || m.region === c.matched.region) &&
      (key !== 'internetEgressGiB' || (() => { const route = extractTrafficRoute(m).value; return route.state === 'known' && route.value === 'internet'; })()) &&
      (key !== 'objectStorageGiB' || String(m.dimensions.storageClass).toLowerCase() === 'standard'))
      .map(m => ({role,meter:m,quantity}));
    const priced = choices.map(p=>({p,l:line(p)})).filter(x=>'amount' in x.l);
    priced.sort((a,b) => compareAmounts(parseDecimal((a.l as EstimateLineItem).amount!.amount),parseDecimal((b.l as EstimateLineItem).amount!.amount)));
    const best = priced[0]?.p ?? choices[0];
    if (!best) result.reason ??= why('price_missing',`В каталоге нет полной ставки ${key}.`,`/addons/${key}`);
    else result.parts.push(best);
  }
  return result;
}
function quoteCandidate(c: Candidate, provider: {id:string;name:string}, r: EstimateResource): ProviderQuote {
  const lineItems: EstimateLineItem[] = [];
  let reason = c.reason ?? null;
  for (const part of c.parts) { const value = line(part); if ('code' in value) reason ??= value; else lineItems.push(value); }
  const matched = {...c.matched,type:r.type,purchaseModel:r.purchaseModel,scope:r.type === 'gpu' ? r.scope : 'instance'};
  const differences = Object.entries(r).filter(([k,v]) => k in matched && JSON.stringify(v) !== JSON.stringify((matched as Record<string,unknown>)[k]))
    .map(([dimension,seed]) => ({dimension,seed,candidate:(matched as Record<string,unknown>)[dimension]}));
  return {provider,status:reason?'incomplete':'priced',total:reason?null:toMoney(sumAmounts(lineItems.map(l=>parseDecimal(l.amount!.amount)))),
    scope:matched.scope ?? 'instance',matchedResource:matched,differences,lineItems,reason,note:null};
}
export function createEstimate(request: EstimateRequest, data: CatalogData = catalog): EstimateResult {
  const parsed = validateEstimateRequest(request);
  const resource = parsed.resource;
  const providers = parsed.providers ?? data.providers.map(p=>p.id);
  const quotes = providers.map((id): ProviderQuote => {
    const provider = {id,name:data.providers.find(p=>p.id===id)?.name ?? id};
    const empty: ProviderQuote = {provider,status:'unavailable',total:null,scope:null,matchedResource:null,differences:[],lineItems:[],reason:null,note:null};
    try {
      const rows = data.meters.filter(m=>m.provider===id && usable(m) && matchesRegion(m,resource.region));
      const candidates = resource.type === 'compute' ? computeCandidates(rows,resource.vcpu,resource.memoryGiB,resource.disk,resource.purchaseModel ?? 'on-demand') : gpuCandidates(rows,resource);
      if (!candidates.length) return {...empty,reason:why('no_matching_product','В каталоге CloudFinOps нет подходящего продукта под этот запрос.')};
      const options = candidates.map(c=>quoteCandidate(addAddons(c,rows,parsed),provider,resource));
      options.sort((a,b) => a.total && b.total ? compareAmounts(parseDecimal(a.total.amount),parseDecimal(b.total.amount)) : a.total ? -1 : b.total ? 1 : 0);
      return options[0];
    } catch { return {...empty,status:'error',reason:why('adapter_error','Не удалось рассчитать строку провайдера.')}; }
  });
  const priced = quotes.filter(q=>q.status==='priced');
  const sorted = [...priced].sort((a,b)=>compareAmounts(parseDecimal(a.total!.amount),parseDecimal(b.total!.amount)));
  return {input:{resource,providers,addons:parsed.addons!,period:'month',monthHours:MONTH_HOURS},
    assumptions:{capacityVerified:false,vat:'catalog_billable_included_rub',period:'month'},quotes,
    lowestPriceProviderIds:sorted.length ? priced.filter(q=>q.total!.amount===sorted[0].total!.amount).map(q=>q.provider.id) : [],
    coverage:{requested:providers.length,priced:priced.length,unavailable:quotes.filter(q=>q.status==='unavailable').length,
      incomplete:quotes.filter(q=>q.status==='incomplete').length,error:quotes.filter(q=>q.status==='error').length}};
}
