import type {
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	INodePropertyOptions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

type Ctx = IExecuteFunctions | IHookFunctions | ILoadOptionsFunctions;

// Events Arrowsterr sends to webhooks. Keep in step with src/lib/integrationTypes.ts in the app.
export const EVENT_OPTIONS: INodePropertyOptions[] = [
	{ name: 'All Events', value: '*', description: 'Every event below' },
	{ name: 'Brief Ready', value: 'brief.ready', description: 'A content brief is ready' },
	{ name: 'Daily Result', value: 'daily.result', description: "After a brand's daily check, with its visibility and the change" },
	{ name: 'Post Published', value: 'post.published', description: 'A draft was published live to a CMS' },
	{ name: 'Shopping Alert', value: 'shopping.alert', description: 'AI Shopping found a price, stock or reseller problem' },
	{ name: 'Visibility Alert', value: 'visibility.alert', description: 'Visibility moved by your alert size, or a competitor overtook the brand' },
];

// One call to the Arrowsterr API, signed with the saved API key.
export async function arrowsterrRequest(
	this: Ctx,
	method: IHttpRequestMethods,
	path: string,
	qs: IDataObject = {},
	body?: IDataObject,
): Promise<IDataObject> {
	const creds = await this.getCredentials('arrowsterrApi');
	const base = String(creds.baseUrl || 'https://app.arrowsterr.com/api/v1').replace(/\/+$/, '');
	const options: IHttpRequestOptions = {
		method,
		url: `${base}${path}`,
		qs,
		json: true,
	};
	if (body) options.body = body;
	try {
		return (await this.helpers.httpRequestWithAuthentication.call(this, 'arrowsterrApi', options)) as IDataObject;
	} catch (error) {
		throw new NodeApiError(this.getNode(), error as JsonObject);
	}
}

// Brands for the brand dropdown.
export async function getBrands(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const res = await arrowsterrRequest.call(this, 'GET', '/brands');
	const brands = (res.brands as IDataObject[] | undefined) ?? [];
	return brands.map((b) => ({ name: `${b.name} (${b.domain})`, value: String(b.id) }));
}
