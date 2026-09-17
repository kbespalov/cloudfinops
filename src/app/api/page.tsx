import {ApiDocumentation, apiMetadata} from '@/components/api/ApiDocumentation';

export const metadata = apiMetadata('overview');
export default function ApiRoute() { return <ApiDocumentation/>; }
