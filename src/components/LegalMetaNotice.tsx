/** Standard RU legal line when Llama / Meta-adjacent names appear in the product. */
export const META_EXTREMIST_NOTICE =
  '* Meta признана экстремистской организацией, её деятельность на территории России запрещена';

export function LegalMetaNotice({className}: {className?: string}) {
  return <p className={className}>{META_EXTREMIST_NOTICE}</p>;
}
